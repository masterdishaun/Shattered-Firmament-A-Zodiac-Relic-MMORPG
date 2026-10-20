extends SceneTree

const TEST_PASSWORD := "correct horse battery staple 42"


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var api_base := OS.get_environment("SF_TEST_API_BASE")
	var game_url := OS.get_environment("SF_TEST_GAME_URL")
	if api_base.is_empty() or game_url.is_empty():
		_fail("Set SF_TEST_API_BASE and SF_TEST_GAME_URL to isolated disposable test services.")
		return
	var main_scene := load("res://scenes/main.tscn") as PackedScene
	assert(main_scene != null, "Main scene must load")
	var game_scene := main_scene.instantiate() as Node3D
	root.add_child(game_scene)
	await process_frame
	var selection_ui := game_scene.get("character_selection_ui") as Control
	assert(selection_ui != null and selection_ui.visible, "Character selection overlay must be the initial screen")
	game_scene.call("_toggle_network_panel")
	await process_frame
	var panel := game_scene.get("network_panel") as Control
	assert(panel != null, "Authenticated network panel must be created")
	(panel.get("api_url_input") as LineEdit).text = api_base
	(panel.get("game_url_input") as LineEdit).text = game_url
	var suffix := str(Time.get_ticks_usec()).right(8)
	(panel.get("email_input") as LineEdit).text = "ui-flow-%s@example.test" % suffix
	(panel.get("username_input") as LineEdit).text = "uiFlow%s" % suffix
	(panel.get("password_input") as LineEdit).text = TEST_PASSWORD
	panel.call("_register")
	if not await _wait_until(func() -> bool: return not bool(panel.get("request_in_flight")) and not String(panel.get("access_token")).is_empty(), 12.0):
		_fail("Account registration did not complete: %s" % (panel.get("status_label") as Label).text)
		return
	if not await _wait_until(func() -> bool: return not bool(panel.get("request_in_flight")), 5.0):
		_fail("Initial roster request did not finish")
		return
	var name_field := selection_ui.find_child("CharacterName", true, false) as LineEdit
	assert(name_field != null, "Character name input must exist")
	name_field.text = "UIFlow%s" % suffix
	selection_ui.call("_select_faction", 0)
	selection_ui.call("_select_class", 0)
	selection_ui.call("_submit_character")
	if not await _wait_until(func() -> bool: return bool(panel.get("world_connected")), 20.0):
		_fail("UI-driven create-and-enter flow failed: %s" % (panel.get("status_label") as Label).text)
		return
	assert(not selection_ui.visible, "Selection overlay must hide after successful world admission")
	assert(not String(panel.get("selected_character_id")).is_empty(), "Server-selected character ID must be present")
	assert((panel.get("characters") as Array).size() == 1, "Created character must appear in the server roster")
	print("GODOT_CHARACTER_CREATION_FLOW_SMOKE=PASS")
	quit(0)


func _wait_until(predicate: Callable, timeout_seconds: float) -> bool:
	var elapsed := 0.0
	while elapsed < timeout_seconds:
		await process_frame
		await create_timer(0.1).timeout
		elapsed += 0.1
		if predicate.call():
			return true
	return false


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
