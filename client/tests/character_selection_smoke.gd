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
	print("GODOT_CHARACTER_SELECTION_SMOKE=PASS")
	quit(0)
