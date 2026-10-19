extends SceneTree

const API_BASE := "http://127.0.0.1:2567"
const TEST_PASSWORD := "correct horse battery staple 42"

var panel_a: Control
var panel_b: Control
var game_scene: Node3D
var character_a_id := ""
var character_b_id := ""
var panel_a_join_count := 0
var combat_results: Array[Dictionary] = []


func _initialize() -> void:
	call_deferred("_run_multiplayer_smoke")


func _run_multiplayer_smoke() -> void:
	var panel_script: Script = load("res://scripts/network_panel.gd")
	if panel_script == null:
		_fail("Could not load the online account panel.")
		return
	panel_a = panel_script.new()
	panel_b = panel_script.new()
	root.add_child(panel_a)
	root.add_child(panel_b)
	panel_a.world_joined.connect(_on_panel_a_world_joined)
	panel_a.combat_result.connect(_on_panel_a_combat_result)
	await process_frame
	panel_a.api_url_input.text = API_BASE
	panel_b.api_url_input.text = API_BASE

	var suffix := str(Time.get_ticks_usec())
	var username_a := "multiA" + suffix.right(8)
	var username_b := "multiB" + suffix.right(8)
	if not await _register_and_create(
		panel_a,
		username_a,
		"multi-a-%s@example.test" % suffix,
		"Sovereign %s" % suffix.right(4),
		0,
		0
	):
		_fail("Could not register/create the Sovereign test character.")
		return
	if not await _register_and_create(
		panel_b,
		username_b,
		"multi-b-%s@example.test" % suffix,
		"Ashen %s" % suffix.right(4),
		1,
		1
	):
		_fail("Could not register/create the Ashen test character.")
		return

	character_a_id = String(panel_a.characters[0].get("id", ""))
	character_b_id = String(panel_b.characters[0].get("id", ""))
	panel_a._request_join_ticket()
	if not await _wait_for_world_connected(panel_a):
		_fail("The first character did not join the Colyseus room: %s" % panel_a.status_label.text)
		return
	panel_b._request_join_ticket()
	if not await _wait_for_world_connected(panel_b):
		_fail("The second character did not join the Colyseus room: %s" % panel_b.status_label.text)
		return
	if not await _wait_for_player_count(panel_a, 1) or not await _wait_for_player_count(panel_b, 1):
		_fail("Players in different maps were not isolated from each other's snapshots.")
		return

	var initial_snapshot: Dictionary = panel_a.last_world_snapshot
	var first_state := _find_player(initial_snapshot, character_a_id)
	var second_state := _find_player(initial_snapshot, character_b_id)
	if first_state.is_empty() or not second_state.is_empty():
		_fail("The first client did not receive only the character inside its current map.")
		return
	var second_start_state := _find_player(panel_b.last_world_snapshot, character_b_id)
	if String(first_state.get("mapId", "")) != "white_jade_bastion":
		_fail("The Sovereign character was assigned the wrong start region.")
		return
	if String(second_start_state.get("mapId", "")) != "cinderwake":
		_fail("The Ashen character was assigned the wrong start region.")
		return

	# Zone transfer is a server-validated request and requires physically reaching each start-zone gate.
	for _intent in range(12):
		panel_a.send_move_intent(0.0, 1.0)
		panel_b.send_move_intent(0.0, 1.0)
		await create_timer(0.05).timeout
	panel_a.request_zone_transition("zone.neutral-crossroads")
	panel_b.request_zone_transition("zone.neutral-crossroads")
	if not await _wait_for_zone(panel_a, "zone.neutral-crossroads") or not await _wait_for_zone(panel_b, "zone.neutral-crossroads"):
		_fail("The server did not accept both characters' gate-based transition to the protected hub.")
		return
	if not await _wait_for_player_count(panel_a, 2):
		_fail("The clients did not see each other after entering the same zone.")
		return
	initial_snapshot = panel_a.last_world_snapshot
	first_state = _find_player(initial_snapshot, character_a_id)
	second_state = _find_player(initial_snapshot, character_b_id)
	if String(first_state.get("mapId", "")) != "zone.neutral-crossroads" or String(second_state.get("mapId", "")) != "zone.neutral-crossroads":
		_fail("The server snapshot did not authoritatively update both map IDs.")
		return
	# The server must reject attacks in the protected crossroads without changing health.
	var health_before_safe_attack := int(second_state.get("health", 0))
	var result_count_before := combat_results.size()
	panel_a.send_basic_attack(character_b_id)
	if not await _wait_for_combat_result(result_count_before):
		_fail("The server did not return a combat result for the peace-zone attack.")
		return
	var safe_result: Dictionary = combat_results.back()
	if bool(safe_result.get("accepted", true)) or String(safe_result.get("reason", "")) != "SAFE_ZONE":
		_fail("The server did not reject the peace-zone attack with SAFE_ZONE.")
		return
	if int(_find_player(panel_b.last_world_snapshot, character_b_id).get("health", 0)) != health_before_safe_attack:
		_fail("A rejected peace-zone attack changed character health.")
		return

	panel_a.request_zone_transition("zone.ashen-frontier")
	panel_b.request_zone_transition("zone.ashen-frontier")
	if not await _wait_for_zone(panel_a, "zone.ashen-frontier") or not await _wait_for_zone(panel_b, "zone.ashen-frontier"):
		_fail("Both factions could not enter the contested Ashen Frontier through the server gate.")
		return
	if not await _wait_for_player_count(panel_a, 2):
		_fail("The contested zone did not replicate both faction characters.")
		return
	var target_before_attack := _find_player(panel_a.last_world_snapshot, character_b_id)
	if target_before_attack.is_empty():
		_fail("The Ashen target was missing from the contested-zone snapshot.")
		return
	var target_health_before := int(target_before_attack.get("health", 0))
	await create_timer(0.15).timeout
	result_count_before = combat_results.size()
	panel_a.send_basic_attack(character_b_id)
	if not await _wait_for_combat_result(result_count_before):
		_fail("The server did not return a result for the contested-zone attack.")
		return
	var successful_attack: Dictionary = combat_results.back()
	if not bool(successful_attack.get("accepted", false)) or int(successful_attack.get("damage", 0)) <= 0:
		_fail("The server rejected a valid enemy-faction attack in the contested zone.")
		return
	if not await _wait_for_player_health(panel_a, character_b_id, target_health_before - int(successful_attack.get("damage", 0))):
		_fail("The authoritative world snapshot did not reflect server-applied combat damage.")
		return

	var initial_b_x := float(second_state.get("position", {}).get("x", 0.0))
	for _intent in range(8):
		panel_b.send_move_intent(1.0, 0.0)
		await create_timer(0.05).timeout
	if not await _wait_for_player_x(panel_a, character_b_id, initial_b_x + 0.5):
		_fail("The first client did not receive the second player's authoritative movement within the same zone.")
		return

	var packed_scene: PackedScene = load("res://scenes/main.tscn")
	if packed_scene == null:
		_fail("Could not load the main scene for remote-avatar verification.")
		return
	game_scene = packed_scene.instantiate()
	root.add_child(game_scene)
	await process_frame
	game_scene.active_character_id = character_a_id
	game_scene._on_world_snapshot(panel_a.last_world_snapshot)
	if not game_scene.remote_avatars.has(character_b_id):
		_fail("A real two-player snapshot did not create the remote avatar.")
		return
	var remote_avatar: Node3D = game_scene.remote_avatars[character_b_id]
	if remote_avatar.get_child_count() < 2:
		_fail("The remote avatar is missing its mesh or name label.")
		return

	var remote_before: float = float(game_scene.remote_targets[character_b_id]["position"].x)
	for _intent in range(6):
		panel_b.send_move_intent(1.0, 0.0)
		await create_timer(0.05).timeout
	if not await _wait_for_player_x(panel_a, character_b_id, remote_before + 0.5):
		_fail("The remote character did not continue moving in server snapshots.")
		return
	game_scene._on_world_snapshot(panel_a.last_world_snapshot)
	var remote_after: float = float(game_scene.remote_targets[character_b_id]["position"].x)
	if remote_after <= remote_before + 0.5:
		_fail("The remote avatar did not follow the latest authoritative snapshot.")
		return

	# Simulate an unexpected transport drop; the client must obtain a new one-use ticket.
	var joins_before_reconnect := panel_a_join_count
	var socket: WebSocketPeer = panel_a.game_client.get("_socket")
	if socket == null:
		_fail("The first client's WebSocket was unavailable for reconnect simulation.")
		return
	socket.close(1000, "simulated transient network interruption")
	var reconnected := false
	var reconnect_deadline_ms := Time.get_ticks_msec() + 30_000
	while Time.get_ticks_msec() < reconnect_deadline_ms:
		if panel_a_join_count > joins_before_reconnect and panel_a.world_connected:
			reconnected = true
			break
		await create_timer(0.1).timeout
	if not reconnected:
		_fail("The first client did not recover after a transient WebSocket interruption: %s" % panel_a.status_label.text)
		return
	if panel_a.selected_character_id != character_a_id:
		_fail("Reconnect did not restore the selected character identity.")
		return
	if not await _wait_for_player_count(panel_a, 2):
		_fail("The reconnected client did not receive its authoritative two-player world snapshot.")
		return

	panel_b._logout()
	if not await _wait_for_panel_idle(panel_b):
		_fail("The second client did not log out.")
		return
	await create_timer(0.25).timeout
	if not await _wait_for_player_count(panel_a, 1):
		_fail("The first client did not receive the second player's departure.")
		return
	game_scene._on_world_snapshot(panel_a.last_world_snapshot)
	if game_scene.remote_avatars.has(character_b_id):
		_fail("The departed character's remote avatar was not removed.")
		return

	panel_a._logout()
	if not await _wait_for_panel_idle(panel_a):
		_fail("The first client did not log out.")
		return

	print("GODOT_MULTIPLAYER_SMOKE=PASS")
	panel_a.queue_free()
	panel_b.queue_free()
	game_scene.queue_free()
	await process_frame
	quit(0)


func _on_panel_a_combat_result(result: Dictionary) -> void:
	combat_results.append(result.duplicate(true))


func _wait_for_combat_result(previous_count: int) -> bool:
	for _frame in range(300):
		if combat_results.size() > previous_count:
			return true
		await process_frame
	return false


func _wait_for_player_health(panel: Control, character_id: String, target_health: int) -> bool:
	for _frame in range(300):
		var state := _find_player(panel.last_world_snapshot, character_id)
		if not state.is_empty() and int(state.get("health", 999999)) <= target_health:
			return true
		await process_frame
	return false

func _on_panel_a_world_joined(_character: Dictionary) -> void:
	panel_a_join_count += 1


func _register_and_create(
	panel: Control,
	username: String,
	email: String,
	character_name: String,
	faction_index: int,
	class_index: int
) -> bool:
	panel.email_input.text = email
	panel.username_input.text = username
	panel.password_input.text = TEST_PASSWORD
	panel._register()
	if not await _wait_for_panel_idle(panel):
		return false
	if panel.access_token.is_empty():
		return false
	panel.character_name_input.text = character_name
	panel.faction_select.select(faction_index)
	panel.class_select.select(class_index)
	panel._create_character()
	if not await _wait_for_panel_idle(panel):
		return false
	return panel.characters.size() == 1


func _wait_for_panel_idle(panel: Control) -> bool:
	for _frame in range(900):
		if not panel.request_in_flight and panel.pending_action.is_empty():
			return true
		await process_frame
	return false


func _wait_for_world_connected(panel: Control) -> bool:
	for _frame in range(900):
		if panel.world_connected:
			return true
		await process_frame
	return false


func _wait_for_zone(panel: Control, expected_map_id: String) -> bool:
	for _frame in range(300):
		if panel.current_map_id == expected_map_id:
			return true
		await process_frame
	return false


func _wait_for_player_count(panel: Control, expected_count: int) -> bool:
	for _frame in range(300):
		if panel.last_world_snapshot.get("players", []).size() == expected_count:
			return true
		await process_frame
	return false


func _wait_for_player_x(panel: Control, character_id: String, target_x: float) -> bool:
	for _frame in range(300):
		var state := _find_player(panel.last_world_snapshot, character_id)
		if not state.is_empty():
			var position: Dictionary = state.get("position", {})
			if float(position.get("x", -999.0)) >= target_x:
				return true
		await process_frame
	return false


func _find_player(snapshot: Dictionary, character_id: String) -> Dictionary:
	for state in snapshot.get("players", []):
		if String(state.get("characterId", "")) == character_id:
			return state
	return {}


func _fail(message: String) -> void:
	push_error(message)
	if panel_a != null:
		panel_a.queue_free()
	if panel_b != null:
		panel_b.queue_free()
	if game_scene != null:
		game_scene.queue_free()
	quit(1)
