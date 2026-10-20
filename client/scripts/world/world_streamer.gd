extends Node

var _manifest: Dictionary = {}
var _player: Node3D
var _sector_scene_path := ""
var _sector_size := 32.0
var _streaming_radius := 1
var _unload_radius := 2
var _sector_definitions: Dictionary = {}
var _loaded_sectors: Dictionary = {}
var _scene_load_requested := false
var _sector_scene: PackedScene
var _load_error := ""


func configure(manifest: Dictionary, player: Node3D) -> void:
	_manifest = manifest
	_player = player
	_sector_scene_path = String(manifest.get("sectorScene", ""))
	_sector_size = maxf(1.0, float(manifest.get("sectorSize", 32.0)))
	_streaming_radius = maxi(0, int(manifest.get("streamingRadius", 1)))
	_unload_radius = maxi(_streaming_radius + 1, int(manifest.get("unloadRadius", 2)))
	for entry in manifest.get("sectors", []):
		if not entry is Dictionary or not entry.has("gridX") or not entry.has("id"):
			push_error("Invalid sector entry in world manifest.")
			continue
		var grid_x := int(entry["gridX"])
		if _sector_definitions.has(grid_x):
			push_error("Duplicate gridX %d in world manifest." % grid_x)
			continue
		_sector_definitions[grid_x] = String(entry["id"])


func _ready() -> void:
	if _player == null or _sector_scene_path.is_empty():
		_load_error = "Streamer configuration is incomplete."
		push_error(_load_error)
		return
	var request_result := ResourceLoader.load_threaded_request(_sector_scene_path, "PackedScene", true)
	if request_result != OK:
		_load_error = "Could not start asynchronous sector-scene load: %s" % error_string(request_result)
		push_error(_load_error)
		return
	_scene_load_requested = true


func _process(_delta: float) -> void:
	if not _scene_load_requested or not _load_error.is_empty():
		return
	if _sector_scene == null:
		var status := ResourceLoader.load_threaded_get_status(_sector_scene_path)
		match status:
			ResourceLoader.THREAD_LOAD_LOADED:
				var resource := ResourceLoader.load_threaded_get(_sector_scene_path)
				if resource is PackedScene:
					_sector_scene = resource
				else:
					_load_error = "Sector resource did not resolve to a PackedScene."
					push_error(_load_error)
			ResourceLoader.THREAD_LOAD_FAILED, ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
				_load_error = "Asynchronous sector-scene load failed."
				push_error(_load_error)
			_:
				pass
	if _sector_scene != null:
		_sync_sector_set()


func _sync_sector_set() -> void:
	if _sector_scene == null or _player == null:
		return
	var center_x := int(round(_player.global_position.x / _sector_size))
	var desired: Dictionary = {}
	for offset in range(-_streaming_radius, _streaming_radius + 1):
		var grid_x := center_x + offset
		if _sector_definitions.has(grid_x):
			desired[grid_x] = true

	for grid_x in desired.keys():
		var index := int(grid_x)
		if _loaded_sectors.has(index):
			continue
		var sector := _sector_scene.instantiate()
		if sector.has_method("configure_sector"):
			sector.configure_sector(index)
		sector.position = Vector3(float(index) * _sector_size, 0.0, 0.0)
		add_child(sector)
		_loaded_sectors[index] = sector

	for grid_x in _loaded_sectors.keys():
		var index := int(grid_x)
		if abs(index - center_x) < _unload_radius:
			continue
		var sector: Node3D = _loaded_sectors[index]
		_loaded_sectors.erase(index)
		sector.queue_free()


func get_loaded_sector_count() -> int:
	return _loaded_sectors.size()


func get_loaded_sector_indices() -> Array[int]:
	var indices: Array[int] = []
	for index in _loaded_sectors.keys():
		indices.append(int(index))
	indices.sort()
	return indices


func get_load_error() -> String:
	return _load_error
