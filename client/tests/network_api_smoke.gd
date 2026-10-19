extends SceneTree

const API_BASE := "http://127.0.0.1:2567"
const TEST_PASSWORD := "correct horse battery staple 42"

var network_panel: Control
var ticketed_characters: Array[Dictionary] = []


func _initialize() -> void:
	call_deferred("_run_api_smoke")


func _run_api_smoke() -> void:
	var panel_script: Script = load("res://scripts/network_panel.gd")
	if panel_script == null:
		_fail("Godot could not load the online account panel.")
		return

	network_panel = panel_script.new()
	root.add_child(network_panel)
	await process_frame
	network_panel.api_url_input.text = API_BASE

	var suffix := str(Time.get_ticks_usec())
	var username := "net" + suffix.right(12)
	var email := "network-smoke-%s@example.test" % suffix
	network_panel.email_input.text = email
	network_panel.username_input.text = username
	network_panel.password_input.text = TEST_PASSWORD
	network_panel._register()
	if not await _wait_for_panel_idle():
		_fail("The registration request did not complete.")
		return
	if network_panel.access_token.is_empty() or network_panel.current_user.get("username") != username:
		_fail("The online panel did not register and authenticate the account.")
		return

	var original_refresh_token: String = network_panel.refresh_token
	network_panel._refresh_session()
	if not await _wait_for_panel_idle():
		_fail("The refresh request did not complete.")
		return
	if network_panel.refresh_token.is_empty() or network_panel.refresh_token == original_refresh_token:
		_fail("The online panel did not rotate its refresh token.")
		return

	network_panel.character_name_input.text = "Network Hero %s" % suffix.right(6)
	network_panel.class_select.select(1)
	network_panel.faction_select.select(2)
	network_panel._create_character()
	if not await _wait_for_panel_idle():
		_fail("Character creation did not complete.")
		return
	if network_panel.characters.size() != 1:
		_fail("The online panel did not refresh the character list after creation.")
		return
	var character: Dictionary = network_panel.characters[0]
	if character.get("mapId") != "luminous_veil":
		_fail("The Astral Concord character did not receive the Luminous Veil start.")
		return

	network_panel.character_ticketed.connect(
		func(ticketed_character: Dictionary) -> void:
			ticketed_characters.append(ticketed_character)
	)
	network_panel._request_join_ticket()
	if not await _wait_for_panel_idle():
		_fail("The character-selection request did not complete.")
		return
	if ticketed_characters.size() != 1 or ticketed_characters[0].get("mapId") != "luminous_veil":
		_fail("The online panel did not publish the selected character's server start map.")
		return
	var room_connected := false
	for _frame in range(900):
		if network_panel.world_connected:
			room_connected = true
			break
		await process_frame
	if not room_connected:
		_fail("Godot did not join the Colyseus world room: %s" % network_panel.status_label.text)
		return
	if not network_panel.status_label.text.contains("Connected to Colyseus room"):
		_fail("Godot did not receive the S2C_RoomJoinSuccess welcome message.")
		return

	var character_id := String(ticketed_characters[0].get("id", ""))
	var initial_x := -999.0
	for _frame in range(180):
		for player_state in network_panel.last_world_snapshot.get("players", []):
			if String(player_state.get("characterId", "")) == character_id:
				var initial_position: Dictionary = player_state.get("position", {})
				initial_x = float(initial_position.get("x", -999.0))
				break
		if initial_x > -900.0:
			break
		await process_frame
	if initial_x < -900.0:
		_fail("The server did not send an initial authoritative world snapshot.")
		return
	if not is_equal_approx(initial_x, 22.0):
		_fail("The Astral Concord server spawn position was incorrect: %s" % str(initial_x))
		return

	for _intent in range(12):
		network_panel.send_move_intent(1.0, 0.0)
		await create_timer(0.05).timeout
	var moved_authoritatively := false
	for _frame in range(300):
		for player_state in network_panel.last_world_snapshot.get("players", []):
			if String(player_state.get("characterId", "")) == character_id:
				var current_position: Dictionary = player_state.get("position", {})
				if float(current_position.get("x", initial_x)) > initial_x + 0.5:
					moved_authoritatively = true
					break
		if moved_authoritatively:
			break
		await process_frame
	if not moved_authoritatively:
		_fail("The server did not move the character after validated movement intents.")
		return

	network_panel._logout()
	if not await _wait_for_panel_idle():
		_fail("Logout did not complete.")
		return
	if not network_panel.access_token.is_empty():
		_fail("The online panel did not clear local tokens after logout.")
		return
	if network_panel.world_connected:
		_fail("Logout did not disconnect the Colyseus room client.")
		return
	await create_timer(0.25).timeout

	network_panel.identifier_input.text = username
	network_panel.password_input.text = TEST_PASSWORD
	network_panel._login()
	if not await _wait_for_panel_idle():
		_fail("Login did not complete.")
		return
	if network_panel.current_user.get("username") != username:
		_fail("The online panel did not log in by username.")
		return
	if network_panel.characters.size() != 1:
		_fail("The character list was not restored after login.")
		return
	var saved_position: Dictionary = network_panel.characters[0].get("position", {})
	if float(saved_position.get("x", initial_x)) <= initial_x + 0.5:
		_fail("The server did not persist the authoritative movement position on room exit.")
		return

	network_panel._logout()
	if not await _wait_for_panel_idle():
		_fail("Final logout did not complete.")
		return

	print("GODOT_API_INTEGRATION=PASS")
	network_panel.queue_free()
	await process_frame
	quit(0)


func _wait_for_panel_idle() -> bool:
	for _frame in range(900):
		if not network_panel.request_in_flight and network_panel.pending_action.is_empty():
			return true
		await process_frame
	return false


func _fail(message: String) -> void:
	push_error(message)
	if network_panel != null:
		network_panel.queue_free()
	quit(1)
