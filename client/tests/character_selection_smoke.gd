extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var packed := load("res://scenes/character_selection.tscn") as PackedScene
	assert(packed != null, "Character selection scene must load")
	var ui := packed.instantiate()
	root.add_child(ui)
	await process_frame
	assert(ui.find_child("Faction_sovereign_sect", true, false) != null, "Sovereign faction card must exist")
	assert(ui.find_child("Faction_ashen_syndicate", true, false) != null, "Ashen faction card must exist")
	assert(ui.find_child("Faction_astral_concord", true, false) != null, "Astral faction card must exist")
	assert(ui.find_child("Class_vanguard", true, false) != null, "Vanguard card must exist")
	assert(ui.find_child("Class_mystic", true, false) != null, "Mystic card must exist")
	assert(ui.find_child("Class_support", true, false) != null, "Spirit Warden card must exist")
	assert(ui.find_child("CharacterViewport", true, false) != null, "3D preview viewport must exist")
	assert(ui.find_child("SettingsButton", true, false) != null, "Settings control must exist")
	assert(ui.find_child("MuteButton", true, false) != null, "Mute toggle must exist")
	assert(ui.find_child("AccountButton", true, false) != null, "Account control must exist")
	assert(ui.find_child("ExistingCharacterSelect", true, false) != null, "Existing character selector must exist")

	var original_class := int(ui.get("selected_class_index"))
	ui.call("_select_faction", 1)
	assert(int(ui.get("selected_faction_index")) == 1, "Faction selection must update")
	assert(int(ui.get("selected_class_index")) == original_class, "Faction selection must not change class")
	ui.call("_select_class", 2)
	assert(int(ui.get("selected_faction_index")) == 1, "Class selection must not change faction")
	assert(int(ui.get("selected_class_index")) == 2, "Class selection must update")
	ui.call("_on_presentation_changed", 0)
	ui.call("_on_body_type_changed", 2)
	assert(String(ui.get("selected_body_presentation")) == "Masculine", "Body presentation must be independent")
	assert(String(ui.get("selected_body_type")) == "Heavy", "Body type must be independent")

	var existing_payloads: Array[String] = []
	ui.enter_existing_requested.connect(func(character_id: String) -> void: existing_payloads.append(character_id))
	var roster := ui.find_child("ExistingCharacterSelect", true, false) as OptionButton
	ui.call("_on_characters_loaded", [{"id": "existing-1", "name": "ExistingHero", "level": 8, "classId": "mystic", "factionId": "astral_concord"}])
	assert(roster.item_count == 2, "Roster should contain placeholder and existing character")
	roster.select(1)
	ui.call("_on_existing_character_selected", 1)
	assert(String(ui.get("selected_existing_character_id")) == "existing-1", "Existing character selection must persist")
	assert(String(ui.get("selected_body_presentation")) == "Masculine", "Appearance remains independent of existing class/faction")
	ui.call("_submit_character")
	assert(existing_payloads == ["existing-1"], "Existing character action must request entry, not create a duplicate")
	roster.select(0)
	ui.call("_on_existing_character_selected", 0)
	ui.call("_select_faction", 1)
	ui.call("_select_class", 2)
	ui.call("_on_presentation_changed", 0)
	ui.call("_on_body_type_changed", 2)

	var payloads: Array[Dictionary] = []
	ui.create_requested.connect(func(payload: Dictionary) -> void: payloads.append(payload))
	var name_field := ui.find_child("CharacterName", true, false) as LineEdit
	assert(name_field != null, "Character name input must exist")
	name_field.text = "TestCultivator"
	ui.call("_submit_character")
	assert(payloads.size() == 1, "Valid character selection must emit one payload")
	var payload: Dictionary = payloads[0]
	assert(payload.get("name") == "TestCultivator", "Payload must include name")
	assert(payload.get("classId") == "support", "Payload must include selected class")
	assert(payload.get("factionId") == "ashen_syndicate", "Payload must include selected faction")
	assert(payload.get("appearance", {}).get("presentation") == "Masculine", "Payload must include presentation")
	assert(payload.get("appearance", {}).get("bodyType") == "Heavy", "Payload must include body type")

	var network_script := load("res://scripts/network_panel.gd") as Script
	assert(network_script != null, "Existing authenticated network panel must load")
	var network_panel: Control = network_script.new() as Control
	root.add_child(network_panel)
	await process_frame
	var loaded_rosters: Array = []
	network_panel.characters_loaded.connect(func(characters: Array) -> void: loaded_rosters.append(characters))
	network_panel.set("pending_action", "characters")
	network_panel.set("preferred_character_id", "new-character")
	var response := {"characters": [
		{"id": "old-character", "name": "OldHero", "level": 4},
		{"id": "new-character", "name": "NewHero", "level": 1}
	]}
	network_panel.call("_on_request_completed", HTTPRequest.RESULT_SUCCESS, 200, PackedStringArray(), JSON.stringify(response).to_utf8_buffer())
	assert(loaded_rosters.size() == 1, "Authenticated panel must publish the loaded roster")
	var server_roster_select := network_panel.get("character_select") as OptionButton
	assert(server_roster_select.selected == 1, "Newly created character must be selected by server-returned ID")
	assert(String(network_panel.get("preferred_character_id")).is_empty(), "Preferred ID must be consumed once")
	network_panel.set("pending_action", "characters")
	network_panel.set("preferred_character_id", "missing-character")
	network_panel.set("auto_join_after_create", true)
	var missing_response := {"characters": [{"id": "old-character", "name": "OldHero", "level": 4}]}
	network_panel.call("_on_request_completed", HTTPRequest.RESULT_SUCCESS, 200, PackedStringArray(), JSON.stringify(missing_response).to_utf8_buffer())
	assert(not bool(network_panel.get("auto_join_after_create")), "Missing created character must cancel auto-join")
	assert(not bool(network_panel.get("request_in_flight")), "Missing created character must not start a join request")
	assert((network_panel.get("status_label") as Label).text.contains("world entry was cancelled"), "Missing roster entry must explain why auto-join was cancelled")
	print("GODOT_CHARACTER_SELECTION_SMOKE=PASS")
	quit(0)
