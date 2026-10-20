extends SceneTree

func _initialize() -> void:
	call_deferred("_run_smoke_test")


func _run_smoke_test() -> void:
	var packed_scene: PackedScene = load("res://scenes/main.tscn")
	if packed_scene == null:
		_fail("Main scene could not be loaded.")
		return

	var predicted_start := Vector3.ZERO
	var predicted_once: Vector3 = MovementPrediction.step_position(predicted_start, 1.0, 0.0)
	if not is_equal_approx(predicted_once.x, 0.3):
		_fail("Client movement prediction did not match one 20 Hz server tick.")
		return
	var predicted_diagonal: Vector3 = MovementPrediction.step_position(Vector3.ZERO, 1.0, 1.0)
	if not is_equal_approx(predicted_diagonal.length(), 0.3):
		_fail("Client movement prediction did not normalize diagonal speed.")
		return
	var replayed: Vector3 = MovementPrediction.reconcile_position(Vector3(1.0, 0.04, 2.0), [
		{"sequence": 2, "axisX": 1.0, "axisY": 0.0},
		{"sequence": 3, "axisX": 0.0, "axisY": 1.0}
	])
	if not is_equal_approx(replayed.x, 1.3) or not is_equal_approx(replayed.z, 2.3):
		_fail("Reconciliation did not replay unacknowledged movement inputs.")
		return

	var scene: Node3D = packed_scene.instantiate()
	root.add_child(scene)
	await process_frame

	for required_node in [
		"PlayerCharacter",
		"IsometricCamera",
		"HUD",
		"sovereign_sect_Platform",
		"ashen_syndicate_Platform",
		"astral_concord_Platform",
		"ZodiacRelic_0",
		"ZodiacRelic_1",
		"ZodiacRelic_2"
	]:
		if not scene.has_node(required_node):
			_fail("Missing prototype node: %s" % required_node)
			return

	scene._toggle_network_panel()
	await process_frame
	if scene.world_streamer == null or scene.world_streamer.get("_player") != scene.player:
		_fail("The production world root did not attach streaming to the existing persistent player.")
		return
	for frame in range(120):
		await process_frame
		if scene.world_streamer.get_loaded_sector_count() == 9:
			break
	if scene.world_streamer.get_loaded_sector_count() != 9:
		_fail("The main client did not load the starting sector ring.")
		return
	scene.player.global_position = Vector3(64.0, 0.04, 0.0)
	for frame in range(8):
		await process_frame
	if scene.world_streamer.get_loaded_sector_indices() != [1, 2, 3]:
		_fail("The integrated streamer did not follow the existing main-scene player east.")
		return
	scene._move_to_faction_start(0)
	for frame in range(4):
		await process_frame
	if scene.network_panel == null or not scene.network_panel.visible:
		_fail("The online account panel did not open from the prototype HUD.")
		return
	scene._close_network_panel()

	# Acknowledged input is discarded; newer input is replayed over the server position.
	scene.active_character_id = "local-prediction-smoke"
	scene.network_panel.pending_move_intents.clear()
	scene.network_panel.pending_move_intents.append({"sequence": 1, "axisX": 0.0, "axisY": 0.0})
	scene.network_panel.pending_move_intents.append({"sequence": 2, "axisX": 1.0, "axisY": 0.0})
	scene.network_panel.pending_move_intents.append({"sequence": 3, "axisX": 0.0, "axisY": 1.0})
	scene._on_world_snapshot({
		"serverTick": 1,
		"players": [{
			"characterId": "local-prediction-smoke",
			"mapId": "white_jade_bastion",
			"position": {"x": 1.0, "y": 2.0, "facing": 0.0},
			"movementSequence": 1,
			"health": 100,
			"maxHealth": 100
		}]
	})
	if scene.network_panel.pending_move_intents.size() != 2:
		_fail("Reconciliation did not preserve inputs newer than the server acknowledgement.")
		return
	if not is_equal_approx(scene.predicted_position.x, 1.3) or not is_equal_approx(scene.predicted_position.z, 2.3):
		_fail("The local predicted position did not reconcile from the server snapshot plus pending inputs.")
		return
	scene.network_panel.pending_move_intents.clear()
	scene.network_panel.pending_move_intents.append({"sequence": 4, "axisX": 1.0, "axisY": 0.0})
	scene._on_zone_changed({
		"mapId": "zone.neutral-crossroads",
		"position": {"x": 0.0, "y": 20.0, "facing": 0.0},
		"safeZone": true,
		"pvpEnabled": false
	})
	if not scene.network_panel.pending_move_intents.is_empty():
		_fail("A zone transition did not discard pre-transition predicted inputs.")
		return
	if not is_equal_approx(scene.predicted_position.z, 20.0):
		_fail("A zone transition did not reset prediction to the server-assigned spawn.")
		return
	scene.active_character_id = ""

	# A transient disconnect schedules bounded retry, but logout cancels it.
	scene.network_panel.access_token = "smoke-test-access-token"
	scene.network_panel.selected_character_id = "smoke-test-character"
	scene.network_panel.reconnect_enabled = true
	scene.network_panel._schedule_reconnect("smoke test")
	if scene.network_panel.reconnect_timer.is_stopped():
		_fail("A recoverable world disconnect did not schedule a reconnect attempt.")
		return
	scene.network_panel._clear_session()
	if not scene.network_panel.reconnect_timer.is_stopped() or scene.network_panel.reconnect_enabled:
		_fail("Logout did not cancel automatic reconnect attempts.")
		return

	if not scene.camera.current or scene.camera.projection != Camera3D.PROJECTION_ORTHOGONAL:
		_fail("The isometric follow camera is not configured as expected.")
		return

	scene._move_to_faction_start(2)
	if not is_equal_approx(scene.player.global_position.x, 22.0):
		_fail("Astral Concord start preview did not move the player to its start.")
		return

	scene.nearby_relic_index = 2
	scene._interact_with_relic()
	if not scene.inspected_relics.has("astral_concord"):
		_fail("Relic interaction did not record the Astral Concord relic.")
		return

	var switch_key := InputEventKey.new()
	switch_key.keycode = KEY_1
	switch_key.pressed = true
	scene._unhandled_input(switch_key)
	if not is_equal_approx(scene.player.global_position.x, -22.0):
		_fail("Keyboard faction-start preview did not select White Jade Bastion.")
		return

	var remote_id := "remote-smoke-1"
	scene._on_world_snapshot({
		"serverTick": 1,
		"players": [{
			"characterId": remote_id,
			"name": "Remote Test Hero",
			"mapId": "cinderwake",
			"position": {"x": 4.0, "y": 3.0, "facing": 0.5},
			"movementSequence": 0,
			"health": 100,
			"maxHealth": 100
		}]
	})
	if not scene.remote_avatars.has(remote_id):
		_fail("A remote world snapshot did not create a remote avatar.")
		return
	var remote_avatar: Node3D = scene.remote_avatars[remote_id]
	if not is_equal_approx(remote_avatar.global_position.x, 4.0):
		_fail("The remote avatar did not initialize from its server position.")
		return
	scene._on_world_snapshot({"serverTick": 2, "players": []})
	if scene.remote_avatars.has(remote_id):
		_fail("A remote avatar was not removed after leaving the world snapshot.")
		return

	print("GODOT_PROTOTYPE_SMOKE=PASS")
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
