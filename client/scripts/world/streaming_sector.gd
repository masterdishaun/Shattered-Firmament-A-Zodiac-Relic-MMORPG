extends Node3D

const SECTOR_SIZE := 32.0

var grid_x: int = 0
var grid_z: int = 0


func configure_sector(index_x: int, index_z: int) -> void:
	grid_x = index_x
	grid_z = index_z
	name = "Sector_%+d_%+d" % [grid_x, grid_z]
	_build_ground()
	_build_route_landmarks()


func _build_ground() -> void:
	var ground := StaticBody3D.new()
	ground.name = "GroundCollision"
	ground.position.y = -0.25
	add_child(ground)

	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "TerrainSurface"
	var mesh := BoxMesh.new()
	mesh.size = Vector3(SECTOR_SIZE, 0.5, SECTOR_SIZE)
	mesh_instance.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = _sector_color()
	material.roughness = 0.92
	mesh_instance.material_override = material
	ground.add_child(mesh_instance)

	var collision := CollisionShape3D.new()
	collision.name = "GroundShape"
	var shape := BoxShape3D.new()
	shape.size = Vector3(SECTOR_SIZE, 0.5, SECTOR_SIZE)
	collision.shape = shape
	ground.add_child(collision)


func _build_route_landmarks() -> void:
	# Alternating original blockout landmarks make streamed sector identity visible.
	var pillar_material := StandardMaterial3D.new()
	pillar_material.albedo_color = _landmark_color()
	pillar_material.metallic = 0.18
	pillar_material.roughness = 0.42
	pillar_material.emission_enabled = true
	pillar_material.emission = _landmark_color()
	pillar_material.emission_energy_multiplier = 0.22

	var pillar := MeshInstance3D.new()
	pillar.name = "RouteMarker"
	var pillar_mesh := CylinderMesh.new()
	pillar_mesh.top_radius = 0.42
	pillar_mesh.bottom_radius = 0.62
	pillar_mesh.height = 3.0
	pillar.mesh = pillar_mesh
	pillar.position = Vector3(0.0, 1.5, -7.0)
	pillar.material_override = pillar_material
	add_child(pillar)

	var label := Label3D.new()
	label.name = "SectorLabel"
	label.text = "SECTOR %s / %s" % ["%+d" % grid_x, "%+d" % grid_z]
	label.position = Vector3(0.0, 3.5, -7.0)
	label.font_size = 48
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.modulate = Color(0.92, 0.95, 1.0)
	add_child(label)

	# A low route ribbon lies entirely within this sector, away from its seams.
	var ribbon := MeshInstance3D.new()
	ribbon.name = "RouteRibbon"
	var ribbon_mesh := BoxMesh.new()
	ribbon_mesh.size = Vector3(2.4, 0.06, 15.0)
	ribbon.mesh = ribbon_mesh
	ribbon.position = Vector3(0.0, 0.035, 8.0)
	var ribbon_material := StandardMaterial3D.new()
	ribbon_material.albedo_color = _landmark_color().darkened(0.25)
	ribbon_material.roughness = 0.7
	ribbon.material_override = ribbon_material
	add_child(ribbon)


func _sector_color() -> Color:
	var palette: Array[Color] = [
		Color(0.12, 0.20, 0.22),
		Color(0.15, 0.23, 0.23),
		Color(0.18, 0.25, 0.24),
		Color(0.16, 0.22, 0.25),
		Color(0.20, 0.24, 0.28),
		Color(0.19, 0.22, 0.27),
		Color(0.15, 0.21, 0.25)
	]
	return palette[posmod(grid_x + grid_z + 6, palette.size())]


func _landmark_color() -> Color:
	if grid_x < 0 or grid_z < 0:
		return Color(0.45, 0.77, 0.72)
	if grid_x > 0 or grid_z > 0:
		return Color(0.87, 0.59, 0.30)
	return Color(0.72, 0.80, 1.0)
