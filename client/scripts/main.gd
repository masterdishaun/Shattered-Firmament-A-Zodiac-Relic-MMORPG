extends Control

func _ready() -> void:
	var title := Label.new()
	title.text = "SHATTERED FIRMAMENT"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(title)
