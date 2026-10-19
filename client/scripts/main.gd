extends Node3D

const MOVE_SPEED := 6.0
const GRAVITY := 18.0
const CAMERA_OFFSET := Vector3(9.0, 12.0, 9.0)

const FACTIONS: Array[Dictionary] = [
	{
		"id": "sovereign_sect",
		"name": "SOVEREIGN SECT",
		"zone": "WHITE JADE BASTION",
		"start": Vector3(-22.0, 0.0, 0.0),
		"ground": Color(0.72, 0.79, 0.78),
		"accent": Color(0.25, 0.78, 0.63),
		"relic_text": "The ward remembers every name removed from the official census. Someone has been hiding the truth inside the jade."
	},
	{
		"id": "ashen_syndicate",
		"name": "ASHEN SYNDICATE",
		"zone": "CINDERWAKE",
		"start": Vector3(0.0, 0.0, 0.0),
		"ground": Color(0.24, 0.27, 0.30),
		"accent": Color(1.0, 0.34, 0.12),
		"relic_text": "The shard hums with the last memory of a worker who never made it out of the furnace. The Syndicate's books say the shift was empty."
	},
	{
		"id": "astral_concord",
		"name": "ASTRAL CONCORD",
		"zone": "LUMINOUS VEIL",
		"start": Vector3(22.0, 0.0, 0.0),
		"ground": Color(0.30, 0.48, 0.43),
		"accent": Color(0.50, 0.86, 0.71),
		"relic_text": "The river offers a memory, not an answer: a Guardian choosing to protect a village that had already forgotten its name."
	}
]

var selected_faction_index := 0
var player: CharacterBody3D
var camera: Camera3D
var status_label: Label
var prompt_label: Label
var feedback_label: Label
var hud_root: Control
var network_panel: Control
var nearby_relic_index := -1
var inspected_relics: Dictionary = {}
var hud_refresh_elapsed := 0.0


func _ready() -> void:
	_build_environment()
	_build_world_floor()
	_build_faction_zones()
	_build_player()
	_build_camera()
	_build_hud()
	_move_to_faction_start(0)


func _process(delta: float) -> void:
	if player == null or camera == null:
		return
	camera.global_position = player.global_position + CAMERA_OFFSET
	camera.look_at(player.global_position + Vector3(0.0, 0.8, 0.0), Vector3.UP)
	hud_refresh_elapsed += delta
	if hud_refresh_elapsed >= 0.15:
		hud_refresh_elapsed = 0.0
		var faction: Dictionary = FACTIONS[selected_faction_index]
		status_label.text = "%s  |  X %.1f  Z %.1f" % [
			faction["name"],
			player.global_position.x,
			player.global_position.z
		]


func _physics_process(delta: float) -> void:
	if player == null or camera == null:
		return

	var input_vector := Vector2(
		float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)),
		float(Input.is_key_pressed(KEY_W)) - float(Input.is_key_pressed(KEY_S))
	)
	if input_vector.length_squared() > 1.0:
		input_vector = input_vector.normalized()

	var camera_right := camera.global_basis.x
	camera_right.y = 0.0
	camera_right = camera_right.normalized()
	var camera_forward := -camera.global_basis.z
	camera_forward.y = 0.0
	camera_forward = camera_forward.normalized()
	var direction := camera_right * input_vector.x + camera_forward * input_vector.y
	if direction.length_squared() > 0.001:
		direction = direction.normalized()
		player.rotation.y = atan2(direction.x, direction.z)

	player.velocity.x = direction.x * MOVE_SPEED
	player.velocity.z = direction.z * MOVE_SPEED
	if not player.is_on_floor():
		player.velocity.y -= GRAVITY * delta
	elif player.velocity.y < 0.0:
		player.velocity.y = 0.0
	player.move_and_slide()


func _unhandled_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return

	match event.keycode:
		KEY_1:
			_move_to_faction_start(0)
		KEY_2:
			_move_to_faction_start(1)
		KEY_3:
			_move_to_faction_start(2)
		KEY_E:
			_interact_with_relic()


func _build_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.035, 0.07, 0.15)
	sky_material.sky_horizon_color = Color(0.25, 0.34, 0.43)
	sky_material.ground_bottom_color = Color(0.045, 0.06, 0.075)
	sky_material.ground_horizon_color = Color(0.19, 0.25, 0.29)
	sky.sky_material = sky_material
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.53, 0.66, 0.72)
	environment.ambient_light_energy = 0.65
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)

	var sunlight := DirectionalLight3D.new()
	sunlight.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	sunlight.light_color = Color(0.82, 0.9, 1.0)
	sunlight.light_energy = 1.45
	sunlight.shadow_enabled = true
	add_child(sunlight)


func _build_world_floor() -> void:
	_create_box_body(
		Vector3(0.0, -0.45, 0.0),
		Vector3(72.0, 0.5, 26.0),
		Color(0.075, 0.10, 0.13),
		"WorldGround"
	)
	_create_box_body(
		Vector3(-11.0, -0.12, 0.0),
		Vector3(10.0, 0.25, 4.0),
		Color(0.16, 0.20, 0.23),
		"WesternCauseway"
	)
	_create_box_body(
		Vector3(11.0, -0.12, 0.0),
		Vector3(10.0, 0.25, 4.0),
		Color(0.16, 0.20, 0.23),
		"EasternCauseway"
	)


func _build_faction_zones() -> void:
	for index in range(FACTIONS.size()):
		var faction: Dictionary = FACTIONS[index]
		var start: Vector3 = faction["start"]
		_create_box_body(
			start + Vector3(0.0, -0.22, 0.0),
			Vector3(18.0, 0.55, 18.0),
			faction["ground"],
			"%s_Platform" % faction["id"]
		)
		_create_zone_border(start, faction["accent"], faction["id"])
		match index:
			0:
				_build_sovereign_landmarks(start, faction["accent"])
			1:
				_build_ashen_landmarks(start, faction["accent"])
			2:
				_build_concord_landmarks(start, faction["accent"])
		_build_relic_pedestal(index, start + Vector3(0.0, 0.0, -2.8), faction["accent"])


func _create_zone_border(center: Vector3, accent: Color, prefix: String) -> void:
	var border_material := _material(accent, 0.25)
	_create_visual_box(center + Vector3(0.0, 0.08, -8.55), Vector3(17.0, 0.12, 0.18), border_material, "%s_NorthBorder" % prefix)
	_create_visual_box(center + Vector3(0.0, 0.08, 8.55), Vector3(17.0, 0.12, 0.18), border_material, "%s_SouthBorder" % prefix)
	_create_visual_box(center + Vector3(-8.55, 0.08, 0.0), Vector3(0.18, 0.12, 17.0), border_material, "%s_WestBorder" % prefix)
	_create_visual_box(center + Vector3(8.55, 0.08, 0.0), Vector3(0.18, 0.12, 17.0), border_material, "%s_EastBorder" % prefix)


func _build_sovereign_landmarks(center: Vector3, accent: Color) -> void:
	var jade := _material(accent, 0.2)
	var ivory := _material(Color(0.88, 0.91, 0.87), 0.85)
	for offset in [
		Vector3(-6.2, 0.0, -5.8),
		Vector3(6.2, 0.0, -5.8),
		Vector3(-6.2, 0.0, 5.8),
		Vector3(6.2, 0.0, 5.8)
	]:
		_create_pillar(center + offset, 2.8, 0.42, ivory, "JadeBastionPillar")
		_create_visual_box(center + offset + Vector3(0.0, 2.95, 0.0), Vector3(0.62, 0.16, 0.62), jade, "JadePillarCap")
	_create_box_body(center + Vector3(0.0, 1.7, 4.8), Vector3(1.1, 3.4, 0.75), accent, "SectWard")
	_create_visual_box(center + Vector3(0.0, 3.55, 4.8), Vector3(1.55, 0.18, 1.1), ivory, "SectWardCrown")


func _build_ashen_landmarks(center: Vector3, accent: Color) -> void:
	var iron := _material(Color(0.11, 0.13, 0.15), 0.5, 0.15)
	var ember := _material(accent, 0.3, 0.8)
	for offset in [
		Vector3(-6.2, 0.0, -5.8),
		Vector3(6.2, 0.0, -5.8),
		Vector3(-6.2, 0.0, 5.8),
		Vector3(6.2, 0.0, 5.8)
	]:
		_create_pillar(center + offset, 2.4, 0.52, iron, "CinderForgeTower")
		_create_visual_box(center + offset + Vector3(0.0, 1.2, 0.0), Vector3(0.68, 0.18, 0.68), ember, "ForgeEmber")
	_create_box_body(center + Vector3(0.0, 1.15, 4.8), Vector3(2.4, 2.3, 1.0), Color(0.11, 0.13, 0.15), "CinderPress")
	_create_visual_box(center + Vector3(0.0, 2.35, 4.8), Vector3(1.6, 0.16, 0.7), ember, "CinderPressGlow")


func _build_concord_landmarks(center: Vector3, accent: Color) -> void:
	var bark := _material(Color(0.23, 0.19, 0.13), 0.95)
	var leaves := _material(Color(0.19, 0.53, 0.38), 0.8)
	var river := _material(Color(0.12, 0.46, 0.55), 0.25, 0.2)
	for offset in [
		Vector3(-6.1, 0.0, -5.8),
		Vector3(6.1, 0.0, -5.8),
		Vector3(-6.1, 0.0, 5.8),
		Vector3(6.1, 0.0, 5.8)
	]:
		_create_pillar(center + offset, 2.0, 0.22, bark, "SpiritTreeTrunk")
		_create_visual_sphere(center + offset + Vector3(0.0, 2.0, 0.0), 1.0, leaves, "SpiritTreeCanopy")
	_create_visual_box(center + Vector3(0.0, 0.05, 5.0), Vector3(12.0, 0.08, 1.1), river, "VeilRiver")
	_create_pillar(center + Vector3(0.0, 1.2, 4.8), 2.4, 0.7, _material(accent, 0.3), "ConcordMemoryStone")


func _build_relic_pedestal(zone_index: int, position: Vector3, accent: Color) -> void:
	var pedestal := Node3D.new()
	pedestal.name = "ZodiacRelic_%d" % zone_index
	pedestal.position = position
	add_child(pedestal)
	var stone_material := _material(Color(0.16, 0.2, 0.25), 0.7)
	_create_child_box(pedestal, Vector3(0.0, 0.25, 0.0), Vector3(1.5, 0.5, 1.5), stone_material, "RelicBase")
	_create_child_box(pedestal, Vector3(0.0, 0.7, 0.0), Vector3(0.95, 0.55, 0.95), stone_material, "RelicColumn")
	_create_child_sphere(pedestal, Vector3(0.0, 1.45, 0.0), 0.42, _material(accent, 0.25, 1.0), "ZodiacShard")
	var area := Area3D.new()
	area.name = "InteractionArea"
	pedestal.add_child(area)
	var collision := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 2.5
	collision.shape = sphere
	collision.position.y = 1.0
	area.add_child(collision)
	area.body_entered.connect(_on_relic_body_entered.bind(zone_index))
	area.body_exited.connect(_on_relic_body_exited.bind(zone_index))


func _build_player() -> void:
	player = CharacterBody3D.new()
	player.name = "PlayerCharacter"
	player.floor_snap_length = 0.25
	add_child(player)

	var collision := CollisionShape3D.new()
	var capsule_shape := CapsuleShape3D.new()
	capsule_shape.radius = 0.38
	capsule_shape.height = 1.65
	collision.shape = capsule_shape
	collision.position.y = 0.83
	player.add_child(collision)

	var body_mesh := MeshInstance3D.new()
	var capsule_mesh := CapsuleMesh.new()
	capsule_mesh.radius = 0.38
	capsule_mesh.height = 1.65
	body_mesh.mesh = capsule_mesh
	body_mesh.position.y = 0.83
	body_mesh.material_override = _material(Color(0.72, 0.86, 0.91), 0.35, 0.08)
	player.add_child(body_mesh)

	var spirit_core := MeshInstance3D.new()
	var core_mesh := SphereMesh.new()
	core_mesh.radius = 0.17
	core_mesh.height = 0.34
	spirit_core.mesh = core_mesh
	spirit_core.position = Vector3(0.0, 1.08, -0.34)
	spirit_core.material_override = _material(Color(0.28, 0.92, 0.82), 0.2, 0.7)
	player.add_child(spirit_core)

	var blade := MeshInstance3D.new()
	var blade_mesh := BoxMesh.new()
	blade_mesh.size = Vector3(0.12, 0.82, 0.2)
	blade.mesh = blade_mesh
	blade.position = Vector3(0.42, 0.72, -0.22)
	blade.rotation_degrees.z = -22.0
	blade.material_override = _material(Color(0.65, 0.91, 0.9), 0.2, 0.25)
	player.add_child(blade)


func _build_camera() -> void:
	camera = Camera3D.new()
	camera.name = "IsometricCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 17.0
	camera.near = 0.1
	camera.far = 180.0
	add_child(camera)
	camera.global_position = player.global_position + CAMERA_OFFSET
	camera.look_at(player.global_position + Vector3(0.0, 0.8, 0.0), Vector3.UP)
	camera.current = true


func _build_hud() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "HUD"
	add_child(canvas)
	var root_control := Control.new()
	root_control.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	canvas.add_child(root_control)
	hud_root = root_control

	var panel := PanelContainer.new()
	panel.position = Vector2(24.0, 24.0)
	panel.custom_minimum_size = Vector2(455.0, 232.0)
	panel.size = Vector2(455.0, 232.0)
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.025, 0.045, 0.07, 0.91)
	panel_style.border_color = Color(0.3, 0.72, 0.68, 0.9)
	panel_style.border_width_left = 2
	panel_style.border_width_top = 1
	panel_style.border_width_right = 1
	panel_style.border_width_bottom = 1
	panel_style.content_margin_left = 16.0
	panel_style.content_margin_top = 14.0
	panel_style.content_margin_right = 16.0
	panel_style.content_margin_bottom = 14.0
	panel.add_theme_stylebox_override("panel", panel_style)
	root_control.add_child(panel)

	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 7)
	panel.add_child(stack)

	var title := Label.new()
	title.text = "SHATTERED FIRMAMENT"
	title.add_theme_font_size_override("font_size", 21)
	title.add_theme_color_override("font_color", Color(0.78, 0.94, 0.92))
	stack.add_child(title)

	status_label = Label.new()
	status_label.add_theme_font_size_override("font_size", 13)
	status_label.add_theme_color_override("font_color", Color(0.78, 0.84, 0.88))
	stack.add_child(status_label)

	var help := Label.new()
	help.text = "WASD Move   •   E Inspect Relic   •   1 / 2 / 3 Preview Faction Starts"
	help.add_theme_font_size_override("font_size", 12)
	help.add_theme_color_override("font_color", Color(0.63, 0.72, 0.78))
	stack.add_child(help)

	var online_button := Button.new()
	online_button.text = "ONLINE ACCOUNT / CHARACTER"
	online_button.custom_minimum_size.y = 32.0
	online_button.pressed.connect(_toggle_network_panel)
	stack.add_child(online_button)

	prompt_label = Label.new()
	prompt_label.text = "Find the glowing Zodiac relic."
	prompt_label.add_theme_font_size_override("font_size", 14)
	prompt_label.add_theme_color_override("font_color", Color(0.58, 0.9, 0.77))
	stack.add_child(prompt_label)

	feedback_label = Label.new()
	feedback_label.text = "Blockout prototype · local movement only"
	feedback_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	feedback_label.custom_minimum_size = Vector2(410.0, 36.0)
	feedback_label.add_theme_font_size_override("font_size", 12)
	feedback_label.add_theme_color_override("font_color", Color(0.82, 0.86, 0.88))
	stack.add_child(feedback_label)


func _toggle_network_panel() -> void:
	if network_panel == null:
		var panel_script: Script = load("res://scripts/network_panel.gd")
		if panel_script == null:
			feedback_label.text = "The online account panel could not be loaded."
			return
		network_panel = panel_script.new()
		network_panel.visible = false
		hud_root.add_child(network_panel)
		network_panel.status_changed.connect(_on_network_status_changed)
		network_panel.character_ticketed.connect(_on_character_ticketed)
		network_panel.close_requested.connect(_close_network_panel)
	network_panel.visible = not network_panel.visible


func _close_network_panel() -> void:
	if network_panel != null:
		network_panel.visible = false


func _on_network_status_changed(message: String) -> void:
	feedback_label.text = message


func _on_character_ticketed(character: Dictionary) -> void:
	var map_id: String = String(character.get("mapId", ""))
	var map_to_faction := {
		"white_jade_bastion": 0,
		"cinderwake": 1,
		"luminous_veil": 2
	}
	if map_to_faction.has(map_id):
		_move_to_faction_start(map_to_faction[map_id])
	feedback_label.text = "Server issued a short-lived ticket for %s. Local blockout moved to %s; live room connection is pending SDK compatibility." % [
		String(character.get("name", "character")),
		map_id
	]


func _move_to_faction_start(index: int) -> void:
	selected_faction_index = clampi(index, 0, FACTIONS.size() - 1)
	var faction: Dictionary = FACTIONS[selected_faction_index]
	player.global_position = faction["start"] + Vector3(0.0, 0.04, 4.0)
	player.velocity = Vector3.ZERO
	nearby_relic_index = -1
	prompt_label.text = "Find the glowing Zodiac relic."
	feedback_label.text = "Starting zone: %s. The three faction starts are separate blockout areas." % faction["zone"]
	status_label.text = faction["name"]


func _on_relic_body_entered(body: Node3D, zone_index: int) -> void:
	if body != player:
		return
	nearby_relic_index = zone_index
	prompt_label.text = "Press E to inspect the Zodiac relic in %s." % FACTIONS[zone_index]["zone"]


func _on_relic_body_exited(body: Node3D, zone_index: int) -> void:
	if body != player:
		return
	if nearby_relic_index == zone_index:
		nearby_relic_index = -1
		prompt_label.text = "Find the glowing Zodiac relic."


func _interact_with_relic() -> void:
	if nearby_relic_index < 0:
		feedback_label.text = "Move close to a glowing relic before pressing E."
		return
	var faction: Dictionary = FACTIONS[nearby_relic_index]
	var relic_id: String = faction["id"]
	if inspected_relics.has(relic_id):
		feedback_label.text = "The relic has already shared its memory. Explore another faction's start."
		return
	inspected_relics[relic_id] = true
	feedback_label.text = faction["relic_text"]


func _create_box_body(position: Vector3, size: Vector3, color: Color, node_name: String) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = position
	add_child(body)
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.material_override = _material(color, 0.85)
	body.add_child(mesh_instance)
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	return body


func _create_visual_box(position: Vector3, size: Vector3, material: StandardMaterial3D, node_name: String) -> void:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = node_name
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	mesh_instance.material_override = material
	add_child(mesh_instance)


func _create_pillar(position: Vector3, height: float, radius: float, material: StandardMaterial3D, node_name: String) -> void:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = position + Vector3(0.0, height * 0.5, 0.0)
	add_child(body)
	var mesh_instance := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius * 0.82
	mesh.bottom_radius = radius
	mesh.height = height
	mesh_instance.mesh = mesh
	mesh_instance.material_override = material
	body.add_child(mesh_instance)
	var collision := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = radius
	shape.height = height
	collision.shape = shape
	body.add_child(collision)


func _create_visual_sphere(position: Vector3, radius: float, material: StandardMaterial3D, node_name: String) -> void:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = node_name
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	mesh_instance.material_override = material
	add_child(mesh_instance)


func _create_child_box(parent: Node3D, position: Vector3, size: Vector3, material: StandardMaterial3D, node_name: String) -> void:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = node_name
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	mesh_instance.material_override = material
	parent.add_child(mesh_instance)


func _create_child_sphere(parent: Node3D, position: Vector3, radius: float, material: StandardMaterial3D, node_name: String) -> void:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = node_name
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	mesh_instance.material_override = material
	parent.add_child(mesh_instance)


func _material(color: Color, roughness: float, emission_energy: float = 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	if emission_energy > 0.0:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = emission_energy
	return material
