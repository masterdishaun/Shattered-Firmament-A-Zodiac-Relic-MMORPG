extends Node3D

const MOVE_SPEED := 6.0
const GRAVITY := 18.0
const CLIENT_PREDICTION_TICK := 0.05
const MovementPredictionScript = preload("res://scripts/movement_prediction.gd")
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
var character_selection_ui: Control
var remote_avatars: Dictionary = {}
var remote_targets: Dictionary = {}
var enemy_avatars: Dictionary = {}
var enemy_targets: Dictionary = {}
var current_character_class_id := "vanguard"
var combat_stats_label: Label
var active_character_id := ""
var last_applied_snapshot_tick := 0
var has_authoritative_snapshot := false
var authoritative_target_position := Vector3.ZERO
var authoritative_target_facing := 0.0
var predicted_position := Vector3.ZERO
var correction_offset := Vector3.ZERO
var prediction_accumulator := 0.0
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
	_show_character_selection()


func _process(delta: float) -> void:
	if player == null or camera == null:
		return
	var blend := minf(1.0, delta * 18.0)
	if network_panel != null and network_panel.world_connected and has_authoritative_snapshot:
		correction_offset = correction_offset.lerp(Vector3.ZERO, minf(1.0, delta * 12.0))
		player.global_position = predicted_position + correction_offset
	for character_id in remote_targets:
		var avatar: Node3D = remote_avatars.get(character_id)
		var target: Dictionary = remote_targets[character_id]
		if avatar == null:
			continue
		avatar.global_position = avatar.global_position.lerp(target["position"], blend)
		avatar.rotation.y = lerp_angle(avatar.rotation.y, float(target["facing"]), blend)
	for enemy_id in enemy_targets:
		var enemy_avatar: Node3D = enemy_avatars.get(enemy_id)
		var enemy_target: Dictionary = enemy_targets[enemy_id]
		if enemy_avatar != null:
			var alive := int(enemy_target.get("health", 0)) > 0
			enemy_avatar.visible = alive
			enemy_avatar.global_position = enemy_avatar.global_position.lerp(enemy_target["position"], blend)
			var telegraphing := String(enemy_target.get("aiState", "idle")) == "telegraph"
			var telegraph: MeshInstance3D = enemy_avatar.get_node_or_null("AttackTelegraph") as MeshInstance3D
			if telegraph != null:
				telegraph.visible = alive and telegraphing
				if telegraph.visible:
					var pulse := 0.9 + 0.15 * sin(float(Time.get_ticks_msec()) * 0.018)
					telegraph.scale = Vector3(pulse, 1.0, pulse)
			var state_label: Label3D = enemy_avatar.get_node_or_null("EnemyStatus") as Label3D
			if state_label != null:
				var state_text := "HP %d/%d" % [int(enemy_target.get("health", 0)), int(enemy_target.get("maxHealth", 1))]
				if telegraphing:
					state_text += "  -  WIND-UP"
				state_label.text = state_text
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

	if network_panel != null and network_panel.world_connected:
		prediction_accumulator += minf(delta, 0.1)
		var prediction_steps := 0
		while prediction_accumulator >= CLIENT_PREDICTION_TICK and prediction_steps < 4:
			var sequence: int = network_panel.send_move_intent(direction.x, direction.z)
			if sequence > 0:
				predicted_position = MovementPredictionScript.step_position(
					predicted_position, direction.x, direction.z, CLIENT_PREDICTION_TICK
				)
				if direction.length_squared() > 0.001:
					player.rotation.y = atan2(direction.x, direction.z)
			prediction_accumulator -= CLIENT_PREDICTION_TICK
			prediction_steps += 1
		player.global_position = predicted_position + correction_offset
		player.velocity = Vector3.ZERO
		return

	if direction.length_squared() > 0.001:
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
			if network_panel == null or not network_panel.world_connected:
				_move_to_faction_start(0)
			else:
				_request_class_ability(false)
		KEY_2:
			if network_panel == null or not network_panel.world_connected:
				_move_to_faction_start(1)
			else:
				_request_class_ability(true)
		KEY_3:
			if network_panel == null or not network_panel.world_connected:
				_move_to_faction_start(2)
		KEY_F:
			_request_basic_attack()
		KEY_E:
			_interact_with_relic()
		KEY_T:
			_request_zone_transition()


func _request_basic_attack() -> void:
	if network_panel == null or not network_panel.world_connected:
		feedback_label.text = "Connect to the online world before attacking."
		return
	var nearest_id := ""
	var nearest_distance := 2.5
	for character_id in remote_targets.keys():
		var target: Dictionary = remote_targets[character_id]
		var target_position: Vector3 = target.get("position", Vector3.ZERO)
		var distance := Vector2(player.global_position.x, player.global_position.z).distance_to(Vector2(target_position.x, target_position.z))
		if distance <= nearest_distance:
			nearest_distance = distance
			nearest_id = String(character_id)
	if nearest_id.is_empty():
		var enemy_id := _nearest_enemy_id(2.5)
		if enemy_id.is_empty():
			feedback_label.text = "No target in melee range."
			return
		network_panel.send_ability("basic-strike", enemy_id)
		return
	network_panel.send_basic_attack(nearest_id)


func _on_reward_granted(reward: Dictionary) -> void:
	var experience_awarded := int(reward.get("experienceAwarded", 0))
	var silver_awarded := int(reward.get("silverAwarded", 0))
	var level := int(reward.get("level", 1))
	var total_experience := int(reward.get("totalExperience", 0))
	var total_silver := int(reward.get("totalSilver", 0))
	var message := "Reward: +%d XP, +%d Silver. Level %d | %d total XP | %d Silver." % [
		experience_awarded,
		silver_awarded,
		level,
		total_experience,
		total_silver,
	]
	var loot: Array = reward.get("loot", [])
	for item in loot:
		if item is Dictionary:
			message += " Loot: %s x%d." % [String(item.get("itemId", "item")), int(item.get("quantity", 1))]
	feedback_label.text = message


func _on_combat_result(result: Dictionary) -> void:
	if not bool(result.get("accepted", false)):
		feedback_label.text = "Combat rejected by server: %s." % String(result.get("reason", "unknown"))
		return
	var healing := int(result.get("healing", 0))
	var damage := int(result.get("damage", 0))
	if healing > 0:
		feedback_label.text = "Restored %d health." % healing
	elif damage > 0:
		feedback_label.text = "Server confirmed %d damage." % damage
	else:
		feedback_label.text = "Ability resolved."

func _request_class_ability(secondary: bool) -> void:
	if network_panel == null or not network_panel.world_connected:
		return
	var ability_id := ""
	match current_character_class_id:
		"vanguard": ability_id = "iron-breaker" if secondary else "jade-strike"
		"mystic": ability_id = "starfall" if secondary else "astral-bolt"
		"support":
			if not secondary:
				network_panel.send_ability("spirit-mend", active_character_id)
				return
			ability_id = "resonant-pulse"
	var target_id := _nearest_enemy_id(8.0)
	if target_id.is_empty():
		feedback_label.text = "No Ashen Wisp in ability range. Explore the Ashen Frontier."
		return
	network_panel.send_ability(ability_id, target_id)


func _nearest_enemy_id(max_range: float) -> String:
	var nearest_id := ""
	var nearest_distance := max_range
	for enemy_id in enemy_targets.keys():
		var target: Dictionary = enemy_targets[enemy_id]
		if int(target.get("health", 0)) <= 0:
			continue
		var target_position: Vector3 = target.get("position", Vector3.ZERO)
		var distance := Vector2(player.global_position.x, player.global_position.z).distance_to(Vector2(target_position.x, target_position.z))
		if distance <= nearest_distance:
			nearest_distance = distance
			nearest_id = String(enemy_id)
	return nearest_id


func _request_zone_transition() -> void:
	if network_panel == null or not network_panel.world_connected:
		return
	var map_id: String = String(network_panel.current_map_id)
	var target_map := ""
	if map_id in ["white_jade_bastion", "cinderwake", "luminous_veil"]:
		target_map = "zone.neutral-crossroads"
	elif map_id == "zone.neutral-crossroads":
		if player.global_position.z >= 23.5:
			target_map = ["white_jade_bastion", "cinderwake", "luminous_veil"][selected_faction_index]
		elif player.global_position.z <= 16.5:
			target_map = "zone.ashen-frontier"
	elif map_id == "zone.ashen-frontier":
		target_map = "zone.neutral-crossroads"
	if not target_map.is_empty():
		network_panel.request_zone_transition(target_map)


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
		Vector3(72.0, 0.5, 70.0),
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
	help.text = "WASD Move   E Relic   F Basic Attack   1 Primary   2 Secondary   T Gate"
	help.add_theme_font_size_override("font_size", 12)
	help.add_theme_color_override("font_color", Color(0.63, 0.72, 0.78))
	stack.add_child(help)

	combat_stats_label = Label.new()
	combat_stats_label.text = "HP --/--   Spirit --/--"
	combat_stats_label.add_theme_font_size_override("font_size", 13)
	combat_stats_label.add_theme_color_override("font_color", Color(0.88, 0.82, 0.62))
	stack.add_child(combat_stats_label)

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
	feedback_label.text = "Blockout prototype Ã‚Â· local movement only"
	feedback_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	feedback_label.custom_minimum_size = Vector2(410.0, 36.0)
	feedback_label.add_theme_font_size_override("font_size", 12)
	feedback_label.add_theme_color_override("font_color", Color(0.82, 0.86, 0.88))
	stack.add_child(feedback_label)


func _show_character_selection() -> void:
	var scene := load("res://scenes/character_selection.tscn") as PackedScene
	if scene == null:
		feedback_label.text = "Character selection UI could not be loaded."
		return
	character_selection_ui = scene.instantiate() as Control
	hud_root.add_child(character_selection_ui)
	character_selection_ui.create_requested.connect(_on_character_create_requested)
	character_selection_ui.account_requested.connect(_toggle_network_panel)
	character_selection_ui.enter_existing_requested.connect(_on_enter_existing_character_requested)


func _on_character_create_requested(payload: Dictionary) -> void:
	if network_panel == null:
		_toggle_network_panel()
	if network_panel == null:
		return
	if String(network_panel.get("access_token")).is_empty():
		network_panel.visible = true
		character_selection_ui.call("set_network_status", "Sign in or register through ACCOUNT before forging a character.")
		return
	if bool(network_panel.get("request_in_flight")):
		character_selection_ui.call("set_network_status", "Wait for the current account request to finish.")
		return
	var character_name_field := network_panel.get("character_name_input") as LineEdit
	var class_select_field := network_panel.get("class_select") as OptionButton
	var faction_select_field := network_panel.get("faction_select") as OptionButton
	if character_name_field == null or class_select_field == null or faction_select_field == null:
		character_selection_ui.call("set_network_status", "Character creation controls are unavailable.")
		return
	character_name_field.text = String(payload.get("name", ""))
	var class_id := String(payload.get("classId", ""))
	for i in range(class_select_field.item_count):
		if String(class_select_field.get_item_metadata(i)) == class_id:
			class_select_field.select(i)
			break
	var faction_id := String(payload.get("factionId", ""))
	for i in range(faction_select_field.item_count):
		if String(faction_select_field.get_item_metadata(i)) == faction_id:
			faction_select_field.select(i)
			break
	network_panel.set("preferred_character_id", "")
	network_panel.set("auto_join_after_create", true)
	network_panel.call("_create_character")


func _on_enter_existing_character_requested(character_id: String) -> void:
	if network_panel == null:
		_toggle_network_panel()
	if network_panel == null:
		return
	if String(network_panel.get("access_token")).is_empty():
		network_panel.visible = true
		character_selection_ui.call("set_network_status", "Sign in through ACCOUNT to enter an existing character.")
		return
	var character_select_field := network_panel.get("character_select") as OptionButton
	if character_select_field == null:
		character_selection_ui.call("set_network_status", "Character roster is unavailable.")
		return
	for i in range(character_select_field.item_count):
		if String(character_select_field.get_item_metadata(i)) == character_id:
			character_select_field.select(i)
			network_panel.call("_request_join_ticket")
			return
	character_selection_ui.call("set_network_status", "Refresh the account roster and try again.")

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
		network_panel.world_joined.connect(_on_world_joined)
		network_panel.world_snapshot.connect(_on_world_snapshot)
		network_panel.combat_result.connect(_on_combat_result)
		network_panel.reward_granted.connect(_on_reward_granted)
		network_panel.zone_changed.connect(_on_zone_changed)
		network_panel.close_requested.connect(_close_network_panel)
		if character_selection_ui != null:
			network_panel.characters_loaded.connect(Callable(character_selection_ui, "_on_characters_loaded"))
			network_panel.status_changed.connect(Callable(character_selection_ui, "set_network_status"))
	network_panel.visible = not network_panel.visible


func _close_network_panel() -> void:
	if network_panel != null:
		network_panel.visible = false


func _on_world_joined(character: Dictionary) -> void:
	if character_selection_ui != null:
		character_selection_ui.visible = false
	if network_panel != null:
		network_panel.visible = false
	_clear_remote_avatars()
	active_character_id = String(character.get("characterId", active_character_id))
	var position: Dictionary = character.get("position", {})
	if position.has("x") and position.has("y"):
		player.global_position = Vector3(float(position["x"]), 0.04, float(position["y"]))
		player.velocity = Vector3.ZERO
		player.rotation.y = float(position.get("facing", 0.0))
		predicted_position = player.global_position
		correction_offset = Vector3.ZERO
		authoritative_target_position = player.global_position
		authoritative_target_facing = player.rotation.y
	has_authoritative_snapshot = false
	prediction_accumulator = 0.0
	last_applied_snapshot_tick = 0
	feedback_label.text = "Server room handshake confirmed for %s. Authoritative movement and basic combat are active." % String(character.get("name", "character"))


func _on_zone_changed(zone: Dictionary) -> void:
	if network_panel != null and network_panel.has_method("clear_pending_move_intents"):
		network_panel.clear_pending_move_intents()
	var position: Dictionary = zone.get("position", {})
	if position.has("x") and position.has("y"):
		authoritative_target_position = Vector3(float(position["x"]), 0.04, float(position["y"]))
		predicted_position = authoritative_target_position
		correction_offset = Vector3.ZERO
		player.global_position = predicted_position
		has_authoritative_snapshot = true
		prediction_accumulator = 0.0
	_clear_remote_avatars()


func _on_world_snapshot(snapshot: Dictionary) -> void:
	_update_remote_avatars(snapshot)
	_update_enemy_avatars(snapshot)
	for state in snapshot.get("players", []):
		if state is Dictionary and String(state.get("characterId", "")) == active_character_id and combat_stats_label != null:
			combat_stats_label.text = "HP %d/%d   Spirit %d/%d" % [int(state.get("health", 0)), int(state.get("maxHealth", 100)), int(state.get("mana", 0)), int(state.get("maxMana", 100))]
	var server_tick := int(snapshot.get("serverTick", 0))
	if server_tick <= last_applied_snapshot_tick:
		return
	last_applied_snapshot_tick = server_tick
	for state in snapshot.get("players", []):
		if not state is Dictionary or String(state.get("characterId", "")) != active_character_id:
			continue
		var position: Dictionary = state.get("position", {})
		if not position.has("x") or not position.has("y"):
			return
		var authoritative := Vector3(
			float(position["x"]),
			0.04,
			float(position["y"])
		)
		authoritative_target_position = authoritative
		authoritative_target_facing = float(position.get("facing", 0.0))
		var acknowledged_sequence := int(state.get("movementSequence", 0))
		var pending: Array = []
		if network_panel != null and network_panel.has_method("acknowledge_move_intents"):
			pending = network_panel.acknowledge_move_intents(acknowledged_sequence)
		var reconciled: Vector3 = MovementPredictionScript.reconcile_position(authoritative, pending)
		var rendered_before_correction := player.global_position
		var correction_distance := predicted_position.distance_to(reconciled)
		predicted_position = reconciled
		if correction_distance > 2.0:
			# Large corrections are authoritative (collision, zone edge or stale input).
			correction_offset = Vector3.ZERO
		else:
			# Preserve visual continuity while the corrected simulation state catches up.
			correction_offset = rendered_before_correction - predicted_position
		if pending.is_empty():
			player.rotation.y = authoritative_target_facing
		player.global_position = predicted_position + correction_offset
		has_authoritative_snapshot = true
		return


func _update_enemy_avatars(snapshot: Dictionary) -> void:
	var present_ids: Dictionary = {}
	for state in snapshot.get("enemies", []):
		if not state is Dictionary:
			continue
		var enemy_id := String(state.get("id", ""))
		var position: Dictionary = state.get("position", {})
		if enemy_id.is_empty() or not position.has("x") or not position.has("y"):
			continue
		var target_position := Vector3(float(position["x"]), 0.04, float(position["y"]))
		present_ids[enemy_id] = true
		if not enemy_avatars.has(enemy_id):
			var avatar := _create_enemy_avatar(enemy_id, String(state.get("name", "Wild Spirit")))
			add_child(avatar)
			avatar.global_position = target_position
			enemy_avatars[enemy_id] = avatar
		enemy_targets[enemy_id] = {
			"position": target_position,
			"health": int(state.get("health", 0)),
			"maxHealth": int(state.get("maxHealth", 1)),
			"archetype": String(state.get("archetype", "ashen-wisp")),
			"attackStyle": String(state.get("attackStyle", "ranged")),
			"aiState": String(state.get("aiState", "idle")),
			"telegraphEndsAtMs": int(state.get("telegraphEndsAtMs", 0)),
			"targetCharacterId": String(state.get("targetCharacterId", ""))
		}
	for enemy_id in enemy_avatars.keys():
		if not present_ids.has(enemy_id):
			var avatar: Node3D = enemy_avatars[enemy_id]
			avatar.queue_free()
			enemy_avatars.erase(enemy_id)
			enemy_targets.erase(enemy_id)


func _create_enemy_avatar(enemy_id: String, display_name: String) -> Node3D:
	var avatar := Node3D.new()
	avatar.name = "Enemy_" + enemy_id.replace(":", "_").replace("-", "_")
	avatar.set_meta("enemy_id", enemy_id)
	var mesh := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.48
	sphere.height = 0.96
	mesh.mesh = sphere
	mesh.position.y = 0.55
	mesh.material_override = _material(_enemy_color(enemy_id), 0.25, 0.35)
	avatar.add_child(mesh)
	var telegraph := MeshInstance3D.new()
	telegraph.name = "AttackTelegraph"
	var ring := TorusMesh.new()
	ring.inner_radius = 0.58
	ring.outer_radius = 0.72
	telegraph.mesh = ring
	telegraph.position.y = 0.08
	telegraph.material_override = _material(Color(1.0, 0.16, 0.06), 0.3, 0.9)
	telegraph.visible = false
	avatar.add_child(telegraph)
	var state_label := Label3D.new()
	state_label.name = "EnemyStatus"
	state_label.position.y = 1.7
	state_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	state_label.font_size = 20
	state_label.modulate = Color(1.0, 0.83, 0.68)
	state_label.text = "HP --/--"
	avatar.add_child(state_label)
	var label := Label3D.new()
	label.text = display_name
	label.position.y = 1.35
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 28
	label.modulate = Color(1.0, 0.67, 0.46)
	avatar.add_child(label)
	return avatar


func _enemy_color(enemy_id: String) -> Color:
	if enemy_id.contains("jadebound-sentinel"):
		return Color(0.45, 0.82, 0.72)
	if enemy_id.contains("rift-stalker"):
		return Color(0.72, 0.38, 0.96)
	return Color(0.96, 0.36, 0.16)


func _update_remote_avatars(snapshot: Dictionary) -> void:
	var present_ids: Dictionary = {}
	for state in snapshot.get("players", []):
		if not state is Dictionary:
			continue
		var character_id := String(state.get("characterId", ""))
		if character_id.is_empty() or character_id == active_character_id:
			continue
		var position: Dictionary = state.get("position", {})
		if not position.has("x") or not position.has("y"):
			continue
		var target_position := Vector3(
			float(position["x"]),
			0.04,
			float(position["y"])
		)
		var facing := float(position.get("facing", 0.0))
		present_ids[character_id] = true
		if not remote_avatars.has(character_id):
			var avatar := _create_remote_avatar(
				character_id,
				String(state.get("name", "Traveler")),
				String(state.get("mapId", ""))
			)
			add_child(avatar)
			avatar.global_position = target_position
			avatar.rotation.y = facing
			remote_avatars[character_id] = avatar
		remote_targets[character_id] = {
			"position": target_position,
			"facing": facing
		}
	for character_id in remote_avatars.keys():
		if not present_ids.has(character_id):
			var avatar: Node3D = remote_avatars[character_id]
			avatar.queue_free()
			remote_avatars.erase(character_id)
			remote_targets.erase(character_id)


func _create_remote_avatar(character_id: String, display_name: String, map_id: String) -> Node3D:
	var avatar := Node3D.new()
	avatar.name = "RemoteAvatar_" + character_id.replace("-", "").substr(0, 12)
	avatar.set_meta("character_id", character_id)

	var capsule := CapsuleMesh.new()
	capsule.radius = 0.4
	capsule.height = 1.6
	var mesh := MeshInstance3D.new()
	mesh.mesh = capsule
	var material := StandardMaterial3D.new()
	material.albedo_color = _remote_avatar_color(map_id)
	material.roughness = 0.8
	mesh.material_override = material
	mesh.position = Vector3(0.0, 0.8, 0.0)
	avatar.add_child(mesh)

	var name_label := Label3D.new()
	name_label.text = display_name
	name_label.position = Vector3(0.0, 1.8, 0.0)
	name_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	name_label.font_size = 32
	name_label.modulate = Color(0.92, 0.95, 1.0)
	avatar.add_child(name_label)
	return avatar


func _remote_avatar_color(map_id: String) -> Color:
	match map_id:
		"white_jade_bastion":
			return Color(0.72, 0.82, 1.0)
		"cinderwake":
			return Color(1.0, 0.38, 0.22)
		"luminous_veil":
			return Color(0.36, 0.86, 0.62)
		_:
			return Color(0.78, 0.78, 0.84)


func _clear_remote_avatars() -> void:
	for character_id in remote_avatars.keys():
		var avatar: Node3D = remote_avatars[character_id]
		avatar.queue_free()
	remote_avatars.clear()
	remote_targets.clear()
	for enemy_id in enemy_avatars.keys():
		var enemy_avatar: Node3D = enemy_avatars[enemy_id]
		enemy_avatar.queue_free()
	enemy_avatars.clear()
	enemy_targets.clear()


func _on_network_status_changed(message: String) -> void:
	feedback_label.text = message
	if message.begins_with("Signed in as") and network_panel != null:
		network_panel.visible = false
	if network_panel != null and not network_panel.world_connected:
		_clear_remote_avatars()


func _on_character_ticketed(character: Dictionary) -> void:
	_clear_remote_avatars()
	active_character_id = String(character.get("id", ""))
	current_character_class_id = String(character.get("classId", "vanguard"))
	var map_id: String = String(character.get("mapId", ""))
	var map_to_faction := {
		"white_jade_bastion": 0,
		"cinderwake": 1,
		"luminous_veil": 2
	}
	if map_to_faction.has(map_id):
		selected_faction_index = map_to_faction[map_id]
	var position: Dictionary = character.get("position", {})
	if position.has("x") and position.has("y"):
		player.global_position = Vector3(float(position["x"]), 0.04, float(position["y"]))
		player.velocity = Vector3.ZERO
		player.rotation.y = float(position.get("facing", 0.0))
	else:
		_move_to_faction_start(selected_faction_index)
	has_authoritative_snapshot = false
	feedback_label.text = "Server issued a short-lived ticket for %s in %s. Connecting to the authoritative world..." % [
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
