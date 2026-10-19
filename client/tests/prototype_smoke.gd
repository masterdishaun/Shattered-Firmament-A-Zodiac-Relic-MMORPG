extends SceneTree

func _initialize() -> void:
	call_deferred("_run_smoke_test")


func _run_smoke_test() -> void:
	var packed_scene: PackedScene = load("res://scenes/main.tscn")
	if packed_scene == null:
		_fail("Main scene could not be loaded.")
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
	if scene.network_panel == null or not scene.network_panel.visible:
		_fail("The online account panel did not open from the prototype HUD.")
		return
	scene._close_network_panel()

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

	print("GODOT_PROTOTYPE_SMOKE=PASS")
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
