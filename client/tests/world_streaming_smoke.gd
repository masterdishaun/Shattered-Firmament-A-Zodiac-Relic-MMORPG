extends SceneTree


func _initialize() -> void:
	call_deferred("_run_smoke_test")


func _run_smoke_test() -> void:
	var packed_scene := load("res://scenes/world/streaming_prototype.tscn") as PackedScene
	if packed_scene == null:
		_fail("Streaming prototype scene failed to load.")
		return

	var world := packed_scene.instantiate()
	root.add_child(world)
	await process_frame
	await process_frame

	if world.player == null or world.camera == null or world.streamer == null:
		_fail("Persistent player, camera, or streamer was not created.")
		return
	if world.world_lifetime_marker.get_parent() != world:
		_fail("Persistent world-root marker was incorrectly parented under streamed terrain.")
		return

	for frame in range(120):
		await process_frame
		if world.streamer.get_loaded_sector_count() == 9:
			break
	if world.streamer.get_loaded_sector_count() != 9:
		_fail("Initial asynchronous stream did not load the nine adjacent sectors. Error: %s" % world.streamer.get_load_error())
		return
	if world.streamer.get_loaded_sector_indices() != [-1, 0, 1] or not world.streamer.get_loaded_sector_keys().has("0:0"):
		_fail("Initial sector ring is incorrect: %s" % [world.streamer.get_loaded_sector_indices()])
		return
	var central_sector: Node3D = world.streamer._loaded_sectors["0:0"]
	var west_sector: Node3D = world.streamer._loaded_sectors["-1:0"]
	var east_sector: Node3D = world.streamer._loaded_sectors["1:0"]
	var south_sector: Node3D = world.streamer._loaded_sectors["0:-1"]
	var north_sector: Node3D = world.streamer._loaded_sectors["0:1"]
	if not is_equal_approx(central_sector.global_position.x - 16.0, west_sector.global_position.x + 16.0):
		_fail("West/central terrain sector edges do not meet.")
		return
	if not is_equal_approx(central_sector.global_position.x + 16.0, east_sector.global_position.x - 16.0):
		_fail("Central/east terrain sector edges do not meet.")
		return
	if not is_equal_approx(central_sector.global_position.z - 16.0, south_sector.global_position.z + 16.0):
		_fail("South/central terrain sector edges do not meet.")
		return
	if not is_equal_approx(central_sector.global_position.z + 16.0, north_sector.global_position.z - 16.0):
		_fail("Central/north terrain sector edges do not meet.")
		return
	if central_sector.get_node_or_null("GroundCollision/GroundShape") == null:
		_fail("A loaded sector is missing its ground collision shape.")
		return

	var persistent_player: CharacterBody3D = world.player
	var persistent_camera: Camera3D = world.camera
	var persistent_world_root_marker: Node3D = world.world_lifetime_marker
	world.player.global_position = Vector3(64.0, 0.85, 0.0)
	for frame in range(8):
		await process_frame
	if world.player != persistent_player or world.camera != persistent_camera or world.world_lifetime_marker != persistent_world_root_marker:
		_fail("Crossing sector boundaries replaced a persistent world object.")
		return
	if world.streamer.get_loaded_sector_indices() != [1, 2, 3] or not world.streamer.get_loaded_sector_keys().has("2:0"):
		_fail("Eastward traversal did not stream the correct sector ring: %s" % [world.streamer.get_loaded_sector_indices()])
		return

	world.player.global_position = Vector3(-64.0, 0.85, 0.0)
	for frame in range(8):
		await process_frame
	if world.streamer.get_loaded_sector_indices() != [-3, -2, -1] or not world.streamer.get_loaded_sector_keys().has("-2:0"):
		_fail("Westward traversal did not stream the correct sector ring: %s" % [world.streamer.get_loaded_sector_indices()])
		return
	world.player.global_position = Vector3(0.0, 0.85, 64.0)
	for frame in range(8):
		await process_frame
	if world.streamer.get_loaded_sector_count() != 9 or not world.streamer.get_loaded_sector_keys().has("0:2"):
		_fail("Northward traversal did not stream the correct sector rows: %s" % [world.streamer.get_loaded_sector_keys()])
		return

	world.player.global_position = Vector3(0.0, 0.85, -64.0)
	for frame in range(8):
		await process_frame
	if world.streamer.get_loaded_sector_count() != 9 or not world.streamer.get_loaded_sector_keys().has("0:-2"):
		_fail("Southward traversal did not stream the correct sector rows: %s" % [world.streamer.get_loaded_sector_keys()])
		return
	if not world.camera.current:
		_fail("Camera lost current status during sector changes.")
		return
	if world.get_node_or_null("PersistentHUD") == null:
		_fail("Persistent HUD disappeared during sector changes.")
		return

	print("GODOT_WORLD_STREAMING_SMOKE=PASS")
	world.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
