extends RefCounted
class_name MovementPrediction

const TICK_SECONDS := 0.05
const MOVE_SPEED := 6.0

static func step_position(position: Vector3, axis_x: float, axis_y: float, seconds: float = TICK_SECONDS) -> Vector3:
	var axes := Vector2(clampf(axis_x, -1.0, 1.0), clampf(axis_y, -1.0, 1.0))
	if axes.length_squared() > 1.0:
		axes = axes.normalized()
	var step_seconds := clampf(seconds, 0.0, 0.1)
	return position + Vector3(axes.x, 0.0, axes.y) * MOVE_SPEED * step_seconds

static func reconcile_position(authoritative: Vector3, pending_intents: Array) -> Vector3:
	var result := authoritative
	for item in pending_intents:
		if not item is Dictionary:
			continue
		result = step_position(result, float(item.get("axisX", 0.0)), float(item.get("axisY", 0.0)))
	return result
