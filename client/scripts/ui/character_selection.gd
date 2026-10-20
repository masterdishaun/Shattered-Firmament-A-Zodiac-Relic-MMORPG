extends Control

signal create_requested(character_data: Dictionary)
signal enter_world_requested(character_data: Dictionary)
signal settings_opened
signal account_requested
signal enter_existing_requested(character_id: String)

const FACTIONS: Array[Dictionary] = [
	{
		"id": "sovereign_sect", "name": "SOVEREIGN SECT", "region": "WHITE JADE BASTION",
		"motto": "A world without order is a world where the powerful devour the helpless.",
		"description": "Jade wards, disciplined sword traditions, and a peace built on difficult questions.",
		"primary": Color("#173d36"), "accent": Color("#55d7ad"), "highlight": Color("#d8b76a"), "surface": Color("#0b1918")
	},
	{
		"id": "ashen_syndicate", "name": "ASHEN SYNDICATE", "region": "CINDERWAKE",
		"motto": "No throne owns the future.",
		"description": "Fallen-shard technology, restless ambition, and freedom with a dangerous price.",
		"primary": Color("#361b25"), "accent": Color("#ff5369"), "highlight": Color("#c76cff"), "surface": Color("#180f18")
	},
	{
		"id": "astral_concord", "name": "ASTRAL CONCORD", "region": "LUMINOUS VEIL",
		"motto": "Power must answer to the life it touches.",
		"description": "Floating shrines, spirit-beast paths, and a fragile covenant with the living world.",
		"primary": Color("#182b4c"), "accent": Color("#54dfff"), "highlight": Color("#c9d8f2"), "surface": Color("#0b1426")
	}
]

const CLASS_FILE := "res://../shared/fixtures/character-archetypes.json"
const SETTINGS_FILE := "user://shattered_firmament_settings.cfg"
const BASE_SURFACE := Color("#10151f")
const TEXT_PRIMARY := Color("#f1f0e8")
const TEXT_MUTED := Color("#a5b0c1")
const FRAME := Color("#344154")

var selected_faction_index := 0
var selected_class_index := 0
var selected_body_presentation := "Androgynous"
var selected_body_type := "Athletic"
var class_catalog: Array[Dictionary] = []
var faction_buttons: Array[Button] = []
var class_buttons: Array[Button] = []
var faction_title: Label
var faction_region: Label
var faction_description: Label
var faction_atmosphere: ColorRect
var faction_motto: Label
var class_description: Label
var character_name: LineEdit
var existing_character_select: OptionButton
var existing_characters: Array[Dictionary] = []
var selected_existing_character_id := ""
var body_presentation: OptionButton
var body_type: OptionButton
var preview_root: Node3D
var preview_viewport_container: SubViewportContainer
var preview_offhand_weapon: MeshInstance3D
var preview_dragging := false
var preview_material: StandardMaterial3D
var preview_weapon: MeshInstance3D
var preview_head: MeshInstance3D
var preview_torso: MeshInstance3D
var preview_left_arm: MeshInstance3D
var preview_right_arm: MeshInstance3D
var preview_status: Label
var create_button: Button
var mute_button: Button
var settings_dialog: AcceptDialog
var master_volume_slider: HSlider
var fullscreen_toggle: CheckButton
var settings_config := ConfigFile.new()
var loading_local_settings := false
var master_muted := false
var previous_master_volume := 0.8


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_load_class_catalog()
	_build_screen()
	_load_local_settings()
	_apply_faction_theme()
	_select_class(0)
	_update_preview()


func _load_class_catalog() -> void:
	var file := FileAccess.open(CLASS_FILE, FileAccess.READ)
	if file == null:
		class_catalog = [
			{"id": "vanguard", "displayName": "Vanguard", "role": "vanguard"},
			{"id": "blade_dancer", "displayName": "Blade Dancer", "role": "striker"},
			{"id": "spear_saint", "displayName": "Spear Saint", "role": "bruiser"},
			{"id": "shadow_adept", "displayName": "Shadow Adept", "role": "assassin"},
			{"id": "mystic", "displayName": "Astral Mystic", "role": "mystic"},
			{"id": "support", "displayName": "Spirit Warden", "role": "support"},
			{"id": "storm_caller", "displayName": "Storm Caller", "role": "ranger"},
			{"id": "iron_fist", "displayName": "Iron Fist", "role": "disruptor"}
		]
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Array:
		for entry in parsed:
			if entry is Dictionary and not String(entry.get("id", "")).is_empty():
				class_catalog.append(entry)
	if class_catalog.is_empty():
		class_catalog = [{"id": "vanguard", "displayName": "Vanguard", "role": "vanguard"}]


func _build_screen() -> void:
	var background := ColorRect.new()
	background.name = "CelestialBackground"
	background.color = Color("#080d17")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var glow := ColorRect.new()
	glow.name = "FactionAtmosphere"
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	glow.color = Color(0.1, 0.3, 0.35, 0.10)
	faction_atmosphere = glow
	background.add_child(glow)

	var root := VBoxContainer.new()
	root.name = "CharacterSelectionLayout"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var header := _panel(Color("#0a101a"), Color("#283649"), 0)
	header.custom_minimum_size.y = 82
	root.add_child(header)
	var header_row := HBoxContainer.new()
	header_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	header_row.add_theme_constant_override("separation", 18)
	header_row.add_theme_constant_override("margin_left", 28)
	header_row.add_theme_constant_override("margin_right", 28)
	header_row.add_theme_constant_override("margin_top", 10)
	header_row.add_theme_constant_override("margin_bottom", 10)
	header.add_child(header_row)
	var brand_stack := VBoxContainer.new()
	brand_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	brand_stack.alignment = BoxContainer.ALIGNMENT_CENTER
	header_row.add_child(brand_stack)
	brand_stack.add_child(_label("SHATTERED FIRMAMENT", 22, TEXT_PRIMARY, true))
	brand_stack.add_child(_label("A ZODIAC RELIC MMORPG  /  CHARACTER FORGE", 10, TEXT_MUTED))
	var account_button := _button("ACCOUNT", 12)
	account_button.name = "AccountButton"
	account_button.custom_minimum_size = Vector2(100, 40)
	account_button.pressed.connect(func() -> void: account_requested.emit())
	header_row.add_child(account_button)
	var settings_button := _button("SETTINGS", 12)
	settings_button.name = "SettingsButton"
	settings_button.custom_minimum_size = Vector2(110, 40)
	settings_button.pressed.connect(_open_settings)
	header_row.add_child(settings_button)
	mute_button = _button("SOUND: ON", 12)
	mute_button.name = "MuteButton"
	mute_button.custom_minimum_size = Vector2(110, 40)
	mute_button.pressed.connect(_toggle_mute)
	header_row.add_child(mute_button)

	var content := HBoxContainer.new()
	content.name = "SelectionContent"
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 16)
	content.add_theme_constant_override("margin_left", 22)
	content.add_theme_constant_override("margin_right", 22)
	content.add_theme_constant_override("margin_top", 18)
	content.add_theme_constant_override("margin_bottom", 18)
	root.add_child(content)

	_build_faction_column(content)
	_build_character_preview(content)
	_build_class_column(content)

	var footer := _panel(Color("#0a101a"), Color("#283649"), 0)
	footer.custom_minimum_size.y = 76
	root.add_child(footer)
	var footer_row := HBoxContainer.new()
	footer_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	footer_row.add_theme_constant_override("separation", 18)
	footer_row.add_theme_constant_override("margin_left", 28)
	footer_row.add_theme_constant_override("margin_right", 28)
	footer_row.add_theme_constant_override("margin_top", 10)
	footer_row.add_theme_constant_override("margin_bottom", 10)
	footer.add_child(footer_row)
	preview_status = _label("YOUR JOURNEY BEGINS WITH A CHOICE", 11, TEXT_MUTED)
	preview_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview_status.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	footer_row.add_child(preview_status)
	var back_button := _button("BACK", 12)
	back_button.custom_minimum_size = Vector2(105, 44)
	back_button.pressed.connect(func() -> void: preview_status.text = "Character selection is a local UI prototype.")
	footer_row.add_child(back_button)
	create_button = _button("FORGE CHARACTER  ", 13, true)
	create_button.custom_minimum_size = Vector2(220, 44)
	create_button.pressed.connect(_submit_character)
	footer_row.add_child(create_button)

	settings_dialog = AcceptDialog.new()
	settings_dialog.name = "SettingsDialog"
	settings_dialog.title = "FIRMAMENT SETTINGS"
	settings_dialog.dialog_text = "Audio and display preferences are saved on this device."
	var settings_content := VBoxContainer.new()
	settings_content.name = "SettingsContent"
	settings_content.add_theme_constant_override("separation", 12)
	settings_dialog.add_child(settings_content)
	var volume_label := _label("MASTER VOLUME", 10, TEXT_MUTED, true)
	settings_content.add_child(volume_label)
	master_volume_slider = HSlider.new()
	master_volume_slider.name = "MasterVolumeSlider"
	master_volume_slider.min_value = 0.0
	master_volume_slider.max_value = 1.0
	master_volume_slider.step = 0.05
	master_volume_slider.value = 0.8
	master_volume_slider.custom_minimum_size.x = 320
	master_volume_slider.value_changed.connect(_on_master_volume_changed)
	settings_content.add_child(master_volume_slider)
	fullscreen_toggle = CheckButton.new()
	fullscreen_toggle.name = "FullscreenToggle"
	fullscreen_toggle.text = "Fullscreen"
	fullscreen_toggle.toggled.connect(_on_fullscreen_toggled)
	settings_content.add_child(fullscreen_toggle)
	add_child(settings_dialog)


func _build_faction_column(parent: HBoxContainer) -> void:
	var column := VBoxContainer.new()
	column.name = "FactionSelection"
	column.custom_minimum_size.x = 255
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	parent.add_child(column)
	column.add_child(_label("01  /  CHOOSE YOUR OATH", 11, TEXT_MUTED, true))
	column.add_child(_label("Three paths. One broken sky.", 18, TEXT_PRIMARY, true))
	for i in range(FACTIONS.size()):
		var faction: Dictionary = FACTIONS[i]
		var button := Button.new()
		button.name = "Faction_" + String(faction["id"])
		button.custom_minimum_size = Vector2(240, 78)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.text = "%s\n%s" % [String(faction["name"]), String(faction["region"])]
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.add_theme_font_size_override("font_size", 12)
		button.add_theme_color_override("font_color", TEXT_PRIMARY)
		button.add_theme_color_override("font_hover_color", TEXT_PRIMARY)
		button.add_theme_stylebox_override("normal", _style(faction["surface"], FRAME, 1, 8))
		button.add_theme_stylebox_override("hover", _style(faction["primary"], faction["accent"], 1, 8))
		button.add_theme_stylebox_override("pressed", _style(faction["primary"], faction["accent"], 2, 8))
		button.pressed.connect(_select_faction.bind(i))
		column.add_child(button)
		faction_buttons.append(button)
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(spacer)
	faction_title = _label("", 14, TEXT_PRIMARY, true)
	column.add_child(faction_title)
	faction_region = _label("", 10, TEXT_MUTED, true)
	column.add_child(faction_region)
	faction_motto = _label("", 12, TEXT_PRIMARY)
	faction_motto.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	faction_motto.custom_minimum_size.y = 58
	column.add_child(faction_motto)
	faction_description = _label("", 11, TEXT_MUTED)
	faction_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(faction_description)


func _build_character_preview(parent: HBoxContainer) -> void:
	var column := VBoxContainer.new()
	column.name = "CelestialCharacterPreview"
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_stretch_ratio = 1.35
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	parent.add_child(column)
	column.add_child(_label("02  /  YOUR VESSEL", 11, TEXT_MUTED, true))
	var preview_frame := PanelContainer.new()
	preview_frame.name = "PreviewFrame"
	preview_frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	preview_frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview_frame.add_theme_stylebox_override("panel", _style(Color("#0b1321"), FRAME, 1, 12))
	column.add_child(preview_frame)
	var preview_layout := VBoxContainer.new()
	preview_layout.add_theme_constant_override("separation", 6)
	preview_frame.add_child(preview_layout)
	var viewport_container := SubViewportContainer.new()
	viewport_container.name = "CharacterViewportContainer"
	viewport_container.mouse_filter = Control.MOUSE_FILTER_STOP
	viewport_container.gui_input.connect(_on_preview_gui_input)
	preview_viewport_container = viewport_container
	viewport_container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	viewport_container.stretch = true
	preview_layout.add_child(viewport_container)
	var viewport := SubViewport.new()
	viewport.name = "CharacterViewport"
	viewport.size = Vector2i(640, 640)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	viewport_container.add_child(viewport)
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#0b1321")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#9ab3d4")
	environment.ambient_light_energy = 0.65
	world.environment = environment
	viewport.add_child(world)
	var camera := Camera3D.new()
	camera.position = Vector3(4.8, 3.2, 7.2)
	camera.fov = 34
	viewport.add_child(camera)
	camera.look_at(Vector3(0, 1.0, 0), Vector3.UP)
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-36, -28, 0)
	key_light.light_energy = 1.5
	viewport.add_child(key_light)
	var fill_light := OmniLight3D.new()
	fill_light.position = Vector3(-3, 2.4, 1)
	fill_light.light_energy = 0.9
	fill_light.omni_range = 9
	viewport.add_child(fill_light)
	preview_root = Node3D.new()
	preview_root.name = "PreviewCharacter"
	viewport.add_child(preview_root)
	_build_preview_avatar()
	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 8)
	preview_layout.add_child(name_row)
	var name_label := _label("NAME", 10, TEXT_MUTED, true)
	name_label.custom_minimum_size.x = 54
	name_row.add_child(name_label)
	character_name = LineEdit.new()
	character_name.name = "CharacterName"
	character_name.placeholder_text = "Name your cultivator"
	character_name.max_length = 24
	character_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	character_name.custom_minimum_size.y = 38
	name_row.add_child(character_name)
	character_name.text_changed.connect(_on_character_name_changed)
	var existing_row := HBoxContainer.new()
	existing_row.add_theme_constant_override("separation", 8)
	preview_layout.add_child(existing_row)
	existing_row.add_child(_label("ROSTER", 10, TEXT_MUTED, true))
	existing_character_select = OptionButton.new()
	existing_character_select.name = "ExistingCharacterSelect"
	existing_character_select.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	existing_character_select.add_item("Create a new character")
	existing_character_select.set_item_metadata(0, "")
	existing_character_select.select(0)
	existing_character_select.item_selected.connect(_on_existing_character_selected)
	existing_row.add_child(existing_character_select)
	var appearance_row := HBoxContainer.new()
	appearance_row.add_theme_constant_override("separation", 8)
	preview_layout.add_child(appearance_row)
	var presentation_label := _label("PRESENTATION", 10, TEXT_MUTED, true)
	appearance_row.add_child(presentation_label)
	body_presentation = OptionButton.new()
	body_presentation.add_item("Masculine")
	body_presentation.add_item("Feminine")
	body_presentation.add_item("Androgynous")
	body_presentation.select(2)
	body_presentation.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body_presentation.item_selected.connect(_on_presentation_changed)
	appearance_row.add_child(body_presentation)
	var body_type_label := _label("BUILD", 10, TEXT_MUTED, true)
	appearance_row.add_child(body_type_label)
	body_type = OptionButton.new()
	body_type.add_item("Lean")
	body_type.add_item("Athletic")
	body_type.add_item("Heavy")
	body_type.select(1)
	body_type.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body_type.item_selected.connect(_on_body_type_changed)
	appearance_row.add_child(body_type)


func _build_preview_avatar() -> void:
	preview_material = StandardMaterial3D.new()
	preview_material.albedo_color = Color("#d9e2e7")
	preview_material.metallic = 0.24
	preview_material.roughness = 0.34
	var torso_mesh := CapsuleMesh.new()
	torso_mesh.radius = 0.34
	torso_mesh.height = 1.15
	preview_torso = MeshInstance3D.new()
	preview_torso.name = "Torso"
	preview_torso.mesh = torso_mesh
	preview_torso.position = Vector3(0, 1.05, 0)
	preview_torso.material_override = preview_material
	preview_root.add_child(preview_torso)
	var head_mesh := SphereMesh.new()
	head_mesh.radius = 0.25
	head_mesh.height = 0.5
	preview_head = MeshInstance3D.new()
	preview_head.name = "Head"
	preview_head.mesh = head_mesh
	preview_head.position = Vector3(0, 1.86, 0)
	preview_head.material_override = preview_material
	preview_root.add_child(preview_head)
	var arm_mesh := CapsuleMesh.new()
	arm_mesh.radius = 0.12
	arm_mesh.height = 0.72
	preview_left_arm = MeshInstance3D.new()
	preview_left_arm.name = "LeftArm"
	preview_left_arm.mesh = arm_mesh
	preview_left_arm.position = Vector3(-0.42, 1.13, 0)
	preview_left_arm.rotation.z = -0.25
	preview_left_arm.material_override = preview_material
	preview_root.add_child(preview_left_arm)
	preview_right_arm = MeshInstance3D.new()
	preview_right_arm.name = "RightArm"
	preview_right_arm.mesh = arm_mesh
	preview_right_arm.position = Vector3(0.42, 1.13, 0)
	preview_right_arm.rotation.z = 0.25
	preview_right_arm.material_override = preview_material
	preview_root.add_child(preview_right_arm)
	var leg_mesh := CapsuleMesh.new()
	leg_mesh.radius = 0.14
	leg_mesh.height = 0.8
	for side in [-1, 1]:
		var leg := MeshInstance3D.new()
		leg.name = "Leg_%s" % str(side)
		leg.mesh = leg_mesh
		leg.position = Vector3(0.17 * side, 0.36, 0)
		leg.material_override = preview_material
		preview_root.add_child(leg)
	var ring_mesh := TorusMesh.new()
	ring_mesh.inner_radius = 0.78
	ring_mesh.outer_radius = 0.81
	var ring := MeshInstance3D.new()
	ring.name = "CelestialOrbit"
	ring.mesh = ring_mesh
	ring.position.y = 0.08
	var ring_material := StandardMaterial3D.new()
	ring_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_material.albedo_color = FACTIONS[0]["accent"]
	ring_material.emission_enabled = true
	ring_material.emission = FACTIONS[0]["accent"]
	ring_material.emission_energy_multiplier = 1.5
	ring.material_override = ring_material
	preview_root.add_child(ring)
	var floor_mesh := CylinderMesh.new()
	floor_mesh.top_radius = 1.2
	floor_mesh.bottom_radius = 1.35
	floor_mesh.height = 0.12
	var floor := MeshInstance3D.new()
	floor.name = "PreviewDais"
	floor.mesh = floor_mesh
	floor.position.y = -0.08
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("#182437")
	floor_material.metallic = 0.65
	floor_material.roughness = 0.4
	floor.material_override = floor_material
	preview_root.add_child(floor)
	var weapon_mesh := BoxMesh.new()
	weapon_mesh.size = Vector3(0.07, 1.05, 0.12)
	preview_weapon = MeshInstance3D.new()
	preview_weapon.name = "ClassWeapon"
	preview_weapon.mesh = weapon_mesh
	preview_weapon.position = Vector3(0.72, 1.0, 0.02)
	preview_weapon.rotation.z = -0.22
	var weapon_material := StandardMaterial3D.new()
	weapon_material.albedo_color = Color("#d8b76a")
	weapon_material.metallic = 0.8
	weapon_material.roughness = 0.2
	preview_weapon.material_override = weapon_material
	preview_root.add_child(preview_weapon)
	preview_offhand_weapon = MeshInstance3D.new()
	preview_offhand_weapon.name = "OffhandWeapon"
	preview_offhand_weapon.mesh = weapon_mesh
	preview_offhand_weapon.position = Vector3(-0.72, 1.0, 0.02)
	preview_offhand_weapon.rotation.z = 0.22
	preview_offhand_weapon.material_override = weapon_material
	preview_offhand_weapon.visible = false
	preview_root.add_child(preview_offhand_weapon)


func _build_class_column(parent: HBoxContainer) -> void:
	var column := VBoxContainer.new()
	column.name = "ClassSelection"
	column.custom_minimum_size.x = 290
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	parent.add_child(column)
	column.add_child(_label("03  /  CHOOSE YOUR DISCIPLINE", 11, TEXT_MUTED, true))
	column.add_child(_label("A path, not a prison.", 18, TEXT_PRIMARY, true))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)
	var stack := VBoxContainer.new()
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_theme_constant_override("separation", 8)
	scroll.add_child(stack)
	for i in range(class_catalog.size()):
		var entry: Dictionary = class_catalog[i]
		var button := Button.new()
		button.name = "Class_" + String(entry["id"])
		button.custom_minimum_size = Vector2(260, 68)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.text = "%s\n%s" % [String(entry.get("displayName", entry["id"])), _class_subtitle(String(entry.get("role", "combat")))]
		button.add_theme_font_size_override("font_size", 13)
		button.add_theme_color_override("font_color", TEXT_PRIMARY)
		button.add_theme_stylebox_override("normal", _style(Color("#101723"), FRAME, 1, 8))
		button.add_theme_stylebox_override("hover", _style(Color("#192338"), Color("#6689a7"), 1, 8))
		button.pressed.connect(_select_class.bind(i))
		stack.add_child(button)
		class_buttons.append(button)
	class_description = _label("", 11, TEXT_MUTED)
	class_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	class_description.custom_minimum_size.y = 66
	column.add_child(class_description)
	column.add_child(_label("CLASS IS INDEPENDENT OF FACTION AND APPEARANCE.", 9, TEXT_MUTED))


func _class_subtitle(role: String) -> String:
	match role.to_lower():
		"vanguard": return "TANK  /  PROTECTION"
		"striker": return "MELEE  /  MOBILITY"
		"bruiser": return "REACH  /  CROWD CONTROL"
		"assassin": return "STEALTH  /  BURST"
		"mystic": return "RANGED  /  ASTRAL MAGIC"
		"support": return "HEALING  /  WARDING"
		"ranger": return "RANGED  /  AREA CONTROL"
		"disruptor": return "STAGGER  /  DISRUPTION"
		_: return role.to_upper().replace("_", " ") + "  /  COMBAT DISCIPLINE"


func _select_faction(index: int) -> void:
	_clear_existing_selection(true)
	selected_faction_index = clampi(index, 0, FACTIONS.size() - 1)
	_apply_faction_theme()
	_update_preview()


func _select_class(index: int) -> void:
	_clear_existing_selection(true)
	selected_class_index = clampi(index, 0, class_catalog.size() - 1)
	for i in range(class_buttons.size()):
		var selected := i == selected_class_index
		var accent: Color = FACTIONS[selected_faction_index]["accent"]
		class_buttons[i].add_theme_stylebox_override("normal", _style(Color("#192338") if selected else Color("#101723"), accent if selected else FRAME, 2 if selected else 1, 8))
	var entry: Dictionary = class_catalog[selected_class_index]
	var class_id := String(entry.get("id", "vanguard"))
	var descriptions := {
		"vanguard": "A protective frontline anchor built to absorb pressure and hold the line.",
		"blade_dancer": "A mobile melee specialist who chains precise cuts into fluid bursts of damage.",
		"spear_saint": "A reach-focused bruiser who controls space and breaks enemy formations.",
		"shadow_adept": "An elusive assassin who converts timing and positioning into explosive single-target damage.",
		"mystic": "The Astral Mystic channels distant celestial force into precise ranged spells.",
		"support": "The Spirit Warden heals allies and steadies the team through dangerous encounters.",
		"storm_caller": "A ranged storm-weaver who pressures groups with sweeping elemental force.",
		"iron_fist": "A close-range disruptor whose heavy strikes are built around stagger and interruption."
	}
	class_description.text = String(descriptions.get(class_id, "A distinct combat discipline. Your class does not restrict your faction or appearance."))
	_update_preview()


func _apply_faction_theme() -> void:
	var faction: Dictionary = FACTIONS[selected_faction_index]
	if faction_atmosphere != null:
		faction_atmosphere.color = Color(faction["accent"].r, faction["accent"].g, faction["accent"].b, 0.08)
	if faction_title != null:
		faction_title.text = String(faction["name"])
	if faction_region != null:
		faction_region.text = String(faction["region"])
		faction_motto.text = "\"%s\"" % String(faction["motto"])
		faction_description.text = String(faction["description"])
	for i in range(faction_buttons.size()):
		var entry: Dictionary = FACTIONS[i]
		var selected := i == selected_faction_index
		faction_buttons[i].add_theme_stylebox_override("normal", _style(entry["primary"] if selected else entry["surface"], entry["accent"] if selected else FRAME, 2 if selected else 1, 8))
		faction_buttons[i].add_theme_color_override("font_color", entry["highlight"] if selected else TEXT_PRIMARY)
	for i in range(class_buttons.size()):
		var class_selected := i == selected_class_index
		class_buttons[i].add_theme_stylebox_override("normal", _style(Color("#192338") if class_selected else Color("#101723"), faction["accent"] if class_selected else FRAME, 2 if class_selected else 1, 8))
	if preview_root != null:
		var ring := preview_root.get_node_or_null("CelestialOrbit") as MeshInstance3D
		if ring != null and ring.material_override is StandardMaterial3D:
			var ring_material := ring.material_override as StandardMaterial3D
			ring_material.albedo_color = faction["accent"]
			ring_material.emission = faction["accent"]
	if create_button != null:
		create_button.add_theme_stylebox_override("normal", _style(faction["primary"], faction["accent"], 1, 8))
		create_button.add_theme_stylebox_override("hover", _style(faction["primary"].lightened(0.12), faction["accent"], 2, 8))
		create_button.add_theme_color_override("font_color", faction["highlight"])


func _on_presentation_changed(index: int) -> void:
	selected_body_presentation = body_presentation.get_item_text(index)
	_update_preview()


func _on_body_type_changed(index: int) -> void:
	selected_body_type = body_type.get_item_text(index)
	_update_preview()


func _update_preview() -> void:
	if preview_root == null or selected_class_index >= class_catalog.size():
		return
	var faction: Dictionary = FACTIONS[selected_faction_index]
	if preview_material != null:
		preview_material.albedo_color = faction["highlight"].lerp(Color("#d9e2e7"), 0.65)
	var width_scale := 1.0
	var height_scale := 1.0
	match selected_body_type:
		"Lean":
			width_scale = 0.82
			height_scale = 1.04
		"Heavy":
			width_scale = 1.18
			height_scale = 0.96
		_:
			width_scale = 1.0
			height_scale = 1.0
	if preview_torso != null:
		preview_torso.scale = Vector3(width_scale, height_scale, width_scale)
	if preview_head != null:
		preview_head.scale = Vector3(1.0, 1.0, 1.0) if selected_body_presentation == "Androgynous" else Vector3(1.02, 1.0, 1.0)
	if preview_left_arm != null:
		preview_left_arm.scale = Vector3(width_scale, 1.0, width_scale)
	if preview_right_arm != null:
		preview_right_arm.scale = Vector3(width_scale, 1.0, width_scale)
	var class_id := String(class_catalog[selected_class_index].get("id", "vanguard"))
	if preview_weapon != null:
		var weapon_mesh: PrimitiveMesh
		match class_id:
			"spear_saint":
				var spear := BoxMesh.new()
				spear.size = Vector3(0.055, 1.55, 0.07)
				weapon_mesh = spear
			"mystic":
				var staff := CylinderMesh.new()
				staff.top_radius = 0.045
				staff.bottom_radius = 0.07
				staff.height = 1.25
				weapon_mesh = staff
			"support", "storm_caller":
				var focus := SphereMesh.new()
				focus.radius = 0.18 if class_id == "support" else 0.14
				focus.height = 0.36 if class_id == "support" else 0.28
				weapon_mesh = focus
			"shadow_adept":
				var dagger := BoxMesh.new()
				dagger.size = Vector3(0.055, 0.58, 0.08)
				weapon_mesh = dagger
			"iron_fist":
				var gauntlet := BoxMesh.new()
				gauntlet.size = Vector3(0.2, 0.25, 0.18)
				weapon_mesh = gauntlet
			_:
				var blade := BoxMesh.new()
				blade.size = Vector3(0.07, 1.05, 0.12)
				weapon_mesh = blade
		preview_weapon.mesh = weapon_mesh
		preview_weapon.visible = true
		var weapon_material := preview_weapon.material_override as StandardMaterial3D
		if weapon_material != null:
			weapon_material.albedo_color = faction["highlight"]
			weapon_material.emission_enabled = class_id in ["mystic", "support", "storm_caller"]
			weapon_material.emission = faction["accent"]
			weapon_material.emission_energy_multiplier = 0.6
		if preview_offhand_weapon != null:
			preview_offhand_weapon.mesh = weapon_mesh
			preview_offhand_weapon.visible = class_id == "blade_dancer"
			var offhand_material := preview_offhand_weapon.material_override as StandardMaterial3D
			if offhand_material != null and weapon_material != null:
				offhand_material.albedo_color = weapon_material.albedo_color
				offhand_material.emission_enabled = weapon_material.emission_enabled
				offhand_material.emission = weapon_material.emission
				offhand_material.emission_energy_multiplier = weapon_material.emission_energy_multiplier



func set_network_status(message: String) -> void:
	preview_status.text = message


func _on_characters_loaded(characters: Array) -> void:
	existing_characters.clear()
	existing_character_select.clear()
	existing_character_select.add_item("Create a new character")
	existing_character_select.set_item_metadata(0, "")
	for character in characters:
		if not character is Dictionary:
			continue
		existing_characters.append(character)
		existing_character_select.add_item("%s (Lv %s)" % [String(character.get("name", "Character")), str(character.get("level", 1))])
		existing_character_select.set_item_metadata(existing_character_select.item_count - 1, String(character.get("id", "")))
	existing_character_select.select(0)
	_clear_existing_selection(false)
	preview_status.text = "Account roster refreshed: %d character(s)." % existing_characters.size()


func _on_existing_character_selected(index: int) -> void:
	var character_id := String(existing_character_select.get_item_metadata(index))
	if character_id.is_empty():
		_clear_existing_selection(false)
		return
	var selected_character: Dictionary = {}
	for character in existing_characters:
		if String(character.get("id", "")) == character_id:
			selected_character = character
			break
	if selected_character.is_empty():
		_clear_existing_selection(false)
		return
	var faction_id := String(selected_character.get("factionId", selected_character.get("faction_id", "")))
	var class_id := String(selected_character.get("classId", selected_character.get("class_id", "")))
	for i in range(FACTIONS.size()):
		if String(FACTIONS[i]["id"]) == faction_id:
			_select_faction(i)
			break
	for i in range(class_catalog.size()):
		if String(class_catalog[i].get("id", "")) == class_id:
			_select_class(i)
			break
	character_name.text = String(selected_character.get("name", ""))
	selected_existing_character_id = character_id
	create_button.text = "ENTER WORLD  >"
	preview_status.text = "Selected existing character: %s." % character_name.text


func _on_character_name_changed(_value: String) -> void:
	_clear_existing_selection(false)


func _clear_existing_selection(clear_name: bool) -> void:
	if selected_existing_character_id.is_empty():
		return
	selected_existing_character_id = ""
	if clear_name and character_name != null:
		character_name.text = ""
	if create_button != null:
		create_button.text = "FORGE CHARACTER  >"

func _submit_character() -> void:
	if not selected_existing_character_id.is_empty():
		preview_status.text = "Requesting entry for existing character..."
		enter_existing_requested.emit(selected_existing_character_id)
		return
	var name := character_name.text.strip_edges()
	if name.length() < 3:
		preview_status.text = "Choose a character name with at least 3 characters."
		return
	var entry: Dictionary = class_catalog[selected_class_index]
	var faction: Dictionary = FACTIONS[selected_faction_index]
	var payload := {
		"name": name,
		"classId": String(entry.get("id", "vanguard")),
		"factionId": String(faction["id"]),
		"appearance": {"presentation": selected_body_presentation, "bodyType": selected_body_type}
	}
	preview_status.text = "%s  %s / %s. Ready to connect to character creation API." % [name, String(faction["name"]), String(entry.get("displayName", entry["id"]))]
	create_requested.emit(payload)


func _on_preview_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		preview_dragging = event.pressed
		if preview_viewport_container != null:
			preview_viewport_container.accept_event()
	elif event is InputEventMouseMotion and preview_dragging:
		if preview_root != null:
			preview_root.rotation.y += event.relative.x * 0.012
		if preview_viewport_container != null:
			preview_viewport_container.accept_event()


func _load_local_settings() -> void:
	loading_local_settings = true
	settings_config = ConfigFile.new()
	settings_config.load(SETTINGS_FILE)
	var saved_volume := clampf(float(settings_config.get_value("audio", "master_volume", 0.8)), 0.0, 1.0)
	master_muted = bool(settings_config.get_value("audio", "muted", false))
	var fullscreen := bool(settings_config.get_value("display", "fullscreen", false))
	master_volume_slider.value = saved_volume
	fullscreen_toggle.button_pressed = fullscreen
	var master_bus := AudioServer.get_bus_index("Master")
	if master_bus >= 0:
		AudioServer.set_bus_volume_db(master_bus, linear_to_db(saved_volume) if saved_volume > 0.001 else -80.0)
		AudioServer.set_bus_mute(master_bus, master_muted)
	mute_button.text = "SOUND: OFF" if master_muted else "SOUND: ON"
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if fullscreen else DisplayServer.WINDOW_MODE_WINDOWED)
	loading_local_settings = false


func _on_master_volume_changed(value: float) -> void:
	if loading_local_settings:
		return
	var master_bus := AudioServer.get_bus_index("Master")
	if master_bus >= 0:
		AudioServer.set_bus_volume_db(master_bus, linear_to_db(value) if value > 0.001 else -80.0)
	_save_local_settings()


func _on_fullscreen_toggled(enabled: bool) -> void:
	if loading_local_settings:
		return
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if enabled else DisplayServer.WINDOW_MODE_WINDOWED)
	_save_local_settings()


func _save_local_settings() -> void:
	settings_config.set_value("audio", "master_volume", master_volume_slider.value)
	settings_config.set_value("audio", "muted", master_muted)
	settings_config.set_value("display", "fullscreen", fullscreen_toggle.button_pressed)
	settings_config.save(SETTINGS_FILE)


func _toggle_mute() -> void:
	var master_bus := AudioServer.get_bus_index("Master")
	if master_bus >= 0:
		master_muted = not master_muted
		AudioServer.set_bus_mute(master_bus, master_muted)
		mute_button.text = "SOUND: OFF" if master_muted else "SOUND: ON"
		preview_status.text = "Master audio muted." if master_muted else "Master audio restored."
		_save_local_settings()


func _open_settings() -> void:
	settings_opened.emit()
	settings_dialog.popup_centered(Vector2i(520, 320))


func _panel(background: Color, border: Color, border_width: int) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _style(background, border, border_width, 0))
	return panel


func _style(background: Color, border: Color, border_width: int, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style


func _label(value: String, font_size: int, color: Color, bold: bool = false) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	if bold:
		label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.5))
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _button(value: String, font_size: int, prominent: bool = false) -> Button:
	var button := Button.new()
	button.text = value
	button.add_theme_font_size_override("font_size", font_size)
	button.add_theme_color_override("font_color", TEXT_PRIMARY)
	button.add_theme_stylebox_override("normal", _style(Color("#151e2c") if prominent else Color("#101723"), FRAME, 1, 6))
	button.add_theme_stylebox_override("hover", _style(Color("#202d40"), Color("#7e9bb5"), 1, 6))
	button.add_theme_stylebox_override("pressed", _style(Color("#0c121c"), Color("#7e9bb5"), 2, 6))
	return button