extends Node3D

const MANIFEST_PATH := "res://data/world/streaming-proof-manifest.json"
const MOVE_SPEED := 8.0
const GRAVITY := 22.0
const CAMERA_OFFSET := Vector3(0.0, 13.0, 13.0)

var player: CharacterBody3D
var camera: Camera3D
var streamer: Node
var hud_label: Label
var hint_label: Label
var world_lifetime_marker: Node3D
var manifest: Dictionary = {}


func _ready() -> void:
	manifest = _read_manifest()
	if manifest.is_empty():
		push_error("Streaming prototype manifest could not be loaded.")
		return
	_build_environment()
	_build_persistent_player()
	_build_persistent_camera()
	_build_hud()
	_build_streamer()
	player.global_position = _spawn_position_from_manifest()


func _process(delta: float) -> void:
	if player == null or camera == null:
		return
	var target := player.global_position + CAMERA_OFFSET
	camera.global_position = camera.global_position.lerp(target, 1.0 - exp(-6.0 * delta))
	camera.look_at(player.global_position + Vector3(0.0, 0.8, 0.0), Vector3.UP)
	if hud_label != null and streamer != null:
		hud_label.text = "SHATTERED FIRMAMENT  /  STREAMING PROOF\n%s\nPlayer X: %0.1f  |  Loaded sectors: %d  |  Network: offline prototype" % [
			String(manifest.get("manifestId", "unknown")),
			player.global_position.x,
			streamer.get_loaded_sector_count()
		]


func _physics_process(delta: float) -> void:
	if player == null:
		return
	var input_axis := Vector2(
		float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)),
		float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W))
	)
	if input_axis.length_squared() > 1.0:
		input_axis = input_axis.normalized()
	player.velocity.x = input_axis.x * MOVE_SPEED
	player.velocity.z = input_axis.y * MOVE_SPEED
	if not player.is_on_floor():
		player.velocity.y -= GRAVITY * delta
	else:
		player.velocity.y = 0.0
	player.move_and_slide()



func _spawn_position_from_manifest() -> Vector3:
	var anchors: Dictionary = manifest.get("spawnAnchors", {})
	var anchor: Dictionary = anchors.get("streaming_proof_start", {})
	var coordinates: Array = anchor.get("position", [0.0, 0.85, 0.0])
	if coordinates.size() != 3:
		push_warning("Invalid streaming proof spawn anchor; using safe fallback.")
		return Vector3(0.0, 0.85, 0.0)
	return Vector3(float(coordinates[0]), float(coordinates[1]), float(coordinates[2]))


func _read_manifest() -> Dictionary:
	if not FileAccess.file_exists(MANIFEST_PATH):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
	if not parsed is Dictionary:
		return {}
	if not parsed.has("sectors") or not parsed.has("sectorScene"):
		return {}
	return parsed


func _build_environment() -> void:
	var world_environment := WorldEnvironment.new()
	world_environment.name = "WorldEnvironment"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.025, 0.045, 0.075)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.52, 0.60, 0.72)
	environment.ambient_light_energy = 0.8
	world_environment.environment = environment
	add_child(world_environment)

	var light := DirectionalLight3D.new()
	light.name = "CelestialKeyLight"
	light.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	light.light_energy = 1.15
	add_child(light)


func _build_persistent_player() -> void:
	player = CharacterBody3D.new()
	player.name = "PersistentPlayer"
	player.floor_snap_length = 0.3
	player.position = Vector3(0.0, 0.85, 0.0)
	add_child(player)

	var collision := CollisionShape3D.new()
	var capsule_shape := CapsuleShape3D.new()
	capsule_shape.radius = 0.38
	capsule_shape.height = 1.65
	collision.shape = capsule_shape
	player.add_child(collision)

	var avatar := MeshInstance3D.new()
	avatar.name = "BlockoutAvatar"
	var capsule_mesh := CapsuleMesh.new()
	capsule_mesh.radius = 0.38
	capsule_mesh.height = 1.65
	avatar.mesh = capsule_mesh
	avatar.position.y = 0.82
	var avatar_material := StandardMaterial3D.new()
	avatar_material.albedo_color = Color(0.78, 0.84, 1.0)
	avatar_material.metallic = 0.12
	avatar_material.roughness = 0.4
	avatar.material_override = avatar_material
	player.add_child(avatar)

	# This node represents persistent session ownership; terrain sectors never parent it.
	world_lifetime_marker = Node3D.new()
	world_lifetime_marker.name = "WorldRootLifetimeMarker"
	add_child(world_lifetime_marker)


func _build_persistent_camera() -> void:
	camera = Camera3D.new()
	camera.name = "PersistentIsometricCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 22.0
	camera.near = 0.1
	camera.far = 220.0
	add_child(camera)
	camera.global_position = player.global_position + CAMERA_OFFSET
	camera.look_at(player.global_position + Vector3(0.0, 0.8, 0.0), Vector3.UP)
	camera.current = true


func _build_hud() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "PersistentHUD"
	add_child(canvas)

	var panel := PanelContainer.new()
	panel.name = "StreamingStatusPanel"
	panel.position = Vector2(18.0, 18.0)
	panel.custom_minimum_size = Vector2(430.0, 86.0)
	canvas.add_child(panel)

	var stack := VBoxContainer.new()
	panel.add_child(stack)
	hud_label = Label.new()
	hud_label.name = "StreamingStatus"
	hud_label.add_theme_font_size_override("font_size", 15)
	stack.add_child(hud_label)

	hint_label = Label.new()
	hint_label.name = "ControlsHint"
	hint_label.text = "WASD move  |  Cross the visible sector seams without a room change"
	hint_label.add_theme_font_size_override("font_size", 13)
	hint_label.modulate = Color(0.72, 0.80, 0.91)
	stack.add_child(hint_label)


func _build_streamer() -> void:
	var streamer_script := load("res://scripts/world/world_streamer.gd")
	streamer = streamer_script.new()
	streamer.name = "WorldStreamer"
	streamer.configure(manifest, player)
	add_child(streamer)
