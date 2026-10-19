extends Control

signal status_changed(message: String)
signal character_ticketed(character: Dictionary)
signal world_joined(character: Dictionary)
signal world_snapshot(snapshot: Dictionary)
signal zone_changed(zone: Dictionary)
signal close_requested

var access_token := ""
var refresh_token := ""
var current_user: Dictionary = {}
var characters: Array[Dictionary] = []
var pending_action := ""
var request_in_flight := false
var pending_join_ticket := ""
var game_client: Node
var game_room: RefCounted
var world_connected := false
var last_world_snapshot: Dictionary = {}
var current_map_id := ""
var current_zone_rules: Dictionary = {}
var movement_sequence := 0
var last_move_sent_at_ms := 0

var api_url_input: LineEdit
var game_url_input: LineEdit
var identifier_input: LineEdit
var email_input: LineEdit
var username_input: LineEdit
var password_input: LineEdit
var character_name_input: LineEdit
var class_select: OptionButton
var faction_select: OptionButton
var character_select: OptionButton
var status_label: Label
var http_request: HTTPRequest


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_panel()
	http_request = HTTPRequest.new()
	http_request.timeout = 15.0
	http_request.request_completed.connect(_on_request_completed)
	add_child(http_request)


func _build_panel() -> void:
	var panel := PanelContainer.new()
	panel.name = "OnlineSessionPanel"
	panel.anchor_left = 1.0
	panel.anchor_right = 1.0
	panel.anchor_top = 0.0
	panel.anchor_bottom = 0.0
	panel.offset_left = -480.0
	panel.offset_right = -24.0
	panel.offset_top = 24.0
	panel.offset_bottom = 696.0
	panel.custom_minimum_size = Vector2(456.0, 672.0)
	panel.size = Vector2(456.0, 672.0)
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.02, 0.04, 0.065, 0.97)
	panel_style.border_color = Color(0.32, 0.73, 0.68, 0.95)
	panel_style.set_border_width_all(1)
	panel_style.content_margin_left = 14.0
	panel_style.content_margin_right = 14.0
	panel_style.content_margin_top = 12.0
	panel_style.content_margin_bottom = 12.0
	panel.add_theme_stylebox_override("panel", panel_style)
	add_child(panel)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_child(scroll)

	var stack := VBoxContainer.new()
	stack.custom_minimum_size.x = 410.0
	stack.add_theme_constant_override("separation", 7)
	scroll.add_child(stack)

	var heading := Label.new()
	heading.text = "ONLINE ACCOUNT / CHARACTER"
	heading.add_theme_font_size_override("font_size", 18)
	heading.add_theme_color_override("font_color", Color(0.78, 0.94, 0.92))
	stack.add_child(heading)

	_add_label(stack, "API URL")
	api_url_input = _add_input(stack, "API base URL")
	api_url_input.text = "http://127.0.0.1:2567"
	_add_label(stack, "Game WebSocket URL")
	game_url_input = _add_input(stack, "WebSocket endpoint")
	game_url_input.text = "ws://127.0.0.1:2568"

	_add_separator(stack)
	_add_label(stack, "LOGIN")
	identifier_input = _add_input(stack, "Email or username")
	password_input = _add_input(stack, "Password (12+ characters)", true)
	_add_button(stack, "Login", _login)
	_add_separator(stack)

	_add_label(stack, "REGISTER ACCOUNT")
	email_input = _add_input(stack, "Email address")
	username_input = _add_input(stack, "Username (3-24 letters, digits or _)")
	_add_button(stack, "Register", _register)
	_add_button(stack, "Refresh Session", _refresh_session)
	_add_separator(stack)

	_add_label(stack, "CREATE CHARACTER")
	character_name_input = _add_input(stack, "Character name")
	class_select = OptionButton.new()
	for entry in [
		{"label": "Vanguard", "id": "vanguard"},
		{"label": "Mystic", "id": "mystic"},
		{"label": "Spirit Warden", "id": "support"}
	]:
		class_select.add_item(entry["label"])
		class_select.set_item_metadata(class_select.item_count - 1, entry["id"])
	stack.add_child(class_select)

	faction_select = OptionButton.new()
	for entry in [
		{"label": "Sovereign Sect - White Jade Bastion", "id": "sovereign_sect"},
		{"label": "Ashen Syndicate - Cinderwake", "id": "ashen_syndicate"},
		{"label": "Astral Concord - Luminous Veil", "id": "astral_concord"}
	]:
		faction_select.add_item(entry["label"])
		faction_select.set_item_metadata(faction_select.item_count - 1, entry["id"])
	stack.add_child(faction_select)
	_add_button(stack, "Create Character", _create_character)
	_add_separator(stack)

	_add_label(stack, "YOUR CHARACTERS")
	character_select = OptionButton.new()
	character_select.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_child(character_select)
	_add_button(stack, "Refresh Character List", _fetch_characters)
	_add_button(stack, "Request Join Ticket", _request_join_ticket)
	_add_button(stack, "Logout", _logout)
	_add_separator(stack)

	status_label = Label.new()
	status_label.text = "Connect to your local API to begin. Tokens stay in memory only; account data is stored by the API."
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.custom_minimum_size = Vector2(400.0, 56.0)
	status_label.add_theme_font_size_override("font_size", 12)
	status_label.add_theme_color_override("font_color", Color(0.72, 0.84, 0.86))
	stack.add_child(status_label)
	_add_button(stack, "Close Panel", func() -> void: close_requested.emit())


func _add_label(parent: VBoxContainer, value: String) -> void:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", Color(0.63, 0.76, 0.8))
	parent.add_child(label)


func _add_input(parent: VBoxContainer, placeholder: String, secret: bool = false) -> LineEdit:
	var line_edit := LineEdit.new()
	line_edit.placeholder_text = placeholder
	line_edit.secret = secret
	line_edit.custom_minimum_size.y = 34.0
	parent.add_child(line_edit)
	return line_edit


func _add_button(parent: VBoxContainer, text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 34.0
	button.pressed.connect(callback)
	parent.add_child(button)
	return button


func _add_separator(parent: VBoxContainer) -> void:
	parent.add_child(HSeparator.new())


func _set_status(message: String) -> void:
	status_label.text = message
	status_changed.emit(message)


func _base_url() -> String:
	return api_url_input.text.strip_edges().trim_suffix("/")


func _send_request(
	action: String,
	method: HTTPClient.Method,
	path: String,
	payload: Variant = null,
	authenticated: bool = false
) -> void:
	if request_in_flight:
		_set_status("A request is already in progress. Wait for it to finish.")
		return
	var base_url := _base_url()
	if not base_url.begins_with("http://") and not base_url.begins_with("https://"):
		_set_status("API URL must begin with http:// or https://.")
		return
	if authenticated and access_token.is_empty():
		_set_status("Log in first to use this account action.")
		return

	var headers := PackedStringArray()
	var body := ""
	if payload is Dictionary:
		headers.append("Content-Type: application/json")
		body = JSON.stringify(payload)
	if authenticated:
		headers.append("Authorization: Bearer %s" % access_token)
	pending_action = action
	request_in_flight = true
	var error := http_request.request(base_url + path, headers, method, body)
	if error != OK:
		pending_action = ""
		request_in_flight = false
		_set_status("Could not start HTTP request (error %d)." % error)


func _register() -> void:
	_send_request(
		"register",
		HTTPClient.METHOD_POST,
		"/v1/auth/register",
		{
			"email": email_input.text.strip_edges(),
			"username": username_input.text.strip_edges(),
			"password": password_input.text
		}
	)


func _login() -> void:
	_send_request(
		"login",
		HTTPClient.METHOD_POST,
		"/v1/auth/login",
		{
			"identifier": identifier_input.text.strip_edges(),
			"password": password_input.text
		}
	)


func _refresh_session() -> void:
	if refresh_token.is_empty():
		_set_status("No refresh token is available. Log in again.")
		return
	_send_request(
		"refresh",
		HTTPClient.METHOD_POST,
		"/v1/auth/refresh",
		{"refreshToken": refresh_token}
	)


func _fetch_characters() -> void:
	_send_request("characters", HTTPClient.METHOD_GET, "/v1/characters", null, true)


func _create_character() -> void:
	if class_select.item_count == 0 or faction_select.item_count == 0:
		_set_status("The class/faction choices are not available.")
		return
	_send_request(
		"create_character",
		HTTPClient.METHOD_POST,
		"/v1/characters",
		{
			"name": character_name_input.text.strip_edges(),
			"classId": class_select.get_item_metadata(class_select.selected),
			"factionId": faction_select.get_item_metadata(faction_select.selected)
		},
		true
	)


func _request_join_ticket() -> void:
	if character_select.item_count == 0:
		_set_status("Refresh the character list and select a character first.")
		return
	var character_id: Variant = character_select.get_item_metadata(character_select.selected)
	if typeof(character_id) != TYPE_STRING or String(character_id).is_empty():
		_set_status("Select a valid character first.")
		return
	_send_request(
		"select_character",
		HTTPClient.METHOD_POST,
		"/v1/characters/%s/select" % String(character_id),
		null,
		true
	)


func _logout() -> void:
	if access_token.is_empty():
		_clear_session()
		_set_status("Local session tokens cleared.")
		return
	_send_request("logout", HTTPClient.METHOD_POST, "/v1/auth/logout", null, true)


func _clear_session() -> void:
	_disconnect_game_client()
	access_token = ""
	refresh_token = ""
	current_user.clear()
	characters.clear()
	character_select.clear()


func _on_request_completed(
	result: int,
	response_code: int,
	_response_headers: PackedStringArray,
	body: PackedByteArray
) -> void:
	var action := pending_action
	pending_action = ""
	request_in_flight = false
	if result != HTTPRequest.RESULT_SUCCESS:
		_set_status("HTTP request failed (transport result %d)." % result)
		return

	var data: Variant = null
	if body.size() > 0:
		data = JSON.parse_string(body.get_string_from_utf8())
	if response_code < 200 or response_code >= 300:
		var message := "Request failed with HTTP %d." % response_code
		if data is Dictionary and data.has("error"):
			message = String(data["error"].get("message", message))
		_set_status(message)
		return

	match action:
		"register", "login", "refresh":
			if not data is Dictionary or not data.has("accessToken"):
				_set_status("The API response did not contain a valid session.")
				return
			access_token = String(data["accessToken"])
			refresh_token = String(data.get("refreshToken", refresh_token))
			current_user = data.get("user", {})
			_set_status("Signed in as %s." % String(current_user.get("username", "player")))
			_fetch_characters()
		"characters":
			characters.clear()
			character_select.clear()
			if data is Dictionary:
				for character in data.get("characters", []):
					if character is Dictionary:
						characters.append(character)
						character_select.add_item(
							"%s (Lv %s)" % [String(character.get("name", "Character")), str(character.get("level", 1))]
						)
						character_select.set_item_metadata(
							character_select.item_count - 1,
							String(character.get("id", ""))
						)
			if characters.is_empty():
				_set_status("No characters found. Create one below.")
			else:
				_set_status("Loaded %d character(s) for %s." % [
					characters.size(),
					String(current_user.get("username", "player"))
				])
		"create_character":
			if data is Dictionary and data.has("character"):
				_set_status("Character created. Refreshing your character list.")
				_fetch_characters()
			else:
				_set_status("The API did not return the created character.")
		"select_character":
			if not data is Dictionary or not data.has("joinTicket"):
				_set_status("The API did not return a join ticket.")
				return
			pending_join_ticket = String(data["joinTicket"])
			var character: Dictionary = data.get("character", {})
			character_ticketed.emit(character)
			_set_status(
				"Join ticket issued for %s in %s; expires at %s. Connecting to the world room..."
				% [
					String(character.get("name", "character")),
					String(character.get("mapId", "unknown zone")),
					String(data.get("expiresAt", "unknown"))
				]
			)
			_connect_to_world()
		"logout":
			_clear_session()
			_set_status("Logged out. The server session has been revoked.")
		_:
			_set_status("Request completed.")

func _connect_to_world() -> void:
	var ticket_to_use := pending_join_ticket
	_disconnect_game_client(false)
	pending_join_ticket = ticket_to_use
	if pending_join_ticket.is_empty():
		_set_status("Request a fresh join ticket before connecting to the world.")
		return
	var endpoint := game_url_input.text.strip_edges()
	if not endpoint.begins_with("ws://") and not endpoint.begins_with("wss://"):
		_set_status("Game URL must begin with ws:// or wss://.")
		return
	var client_script: Script = load("res://addons/colyseus/src/client/ColyseusClient.gd")
	if client_script == null:
		_set_status("The vendored Colyseus GDScript client is missing.")
		return
	game_client = client_script.new()
	add_child(game_client)
	game_client.set_process(true)
	game_client.connect("connected", Callable(self, "_on_game_client_connected"))
	game_client.connect("error", Callable(self, "_on_game_client_error"))
	game_client.connect("disconnected", Callable(self, "_on_game_client_disconnected"))
	game_client.call("connect_to_server", endpoint)


func _on_game_client_connected() -> void:
	if pending_join_ticket.is_empty() or game_client == null:
		return
	_set_status("Client initialized. Requesting Colyseus world-room admission...")
	game_room = game_client.call("join", "world", {"joinTicket": pending_join_ticket})
	if game_room == null:
		_set_status("Colyseus matchmaking did not return a room.")
		return
	game_room.connect("joined", Callable(self, "_on_room_joined"))
	game_room.connect("message_received", Callable(self, "_on_room_message"))
	game_room.connect("error_received", Callable(self, "_on_room_error"))
	game_room.connect("left", Callable(self, "_on_room_left"))


func _on_room_joined() -> void:
	_set_status("Colyseus accepted the character. Waiting for the world welcome message...")


func _on_room_message(message_type: Variant, data: Variant) -> void:
	var message_name := String(message_type)
	var envelope: Dictionary = data if data is Dictionary else {}
	var payload: Dictionary = envelope.get("payload", {})
	if message_name == "S2C_WorldSnapshot":
		last_world_snapshot = payload
		world_snapshot.emit(payload)
		return
	if message_name == "S2C_ZoneTransitioned":
		current_map_id = String(payload.get("mapId", current_map_id))
		current_zone_rules = {"safeZone": bool(payload.get("safeZone", true)), "pvpEnabled": bool(payload.get("pvpEnabled", false))}
		zone_changed.emit(payload)
		_set_status("Entered %s. PvP: %s." % [current_map_id, "enabled" if bool(payload.get("pvpEnabled", false)) else "protected"])
		return
	if message_name == "S2C_ZoneTransitionRejected":
		_set_status(String(payload.get("message", "The zone gate rejected the transition.")))
		return
	if message_name != "S2C_RoomJoinSuccess":
		return
	var character: Dictionary = payload.get("character", {})
	current_map_id = String(character.get("mapId", ""))
	world_connected = true
	world_joined.emit(character)
	_set_status(
		"Connected to Colyseus room %s as %s. Movement is server-authoritative; combat is not implemented yet."
		% [
			String(payload.get("roomId", "unknown")),
			String(character.get("name", "character"))
		]
	)


func request_zone_transition(target_map_id: String) -> void:
	if not world_connected or game_room == null or target_map_id.is_empty():
		return
	game_room.call("send", "C2S_ZoneTransition", {"targetMapId": target_map_id})


func send_move_intent(axis_x: float, axis_y: float) -> void:
	if not world_connected or game_room == null:
		return
	var now := Time.get_ticks_msec()
	if now - last_move_sent_at_ms < 50:
		return
	last_move_sent_at_ms = now
	movement_sequence += 1
	game_room.call(
		"send",
		"C2S_MoveIntent",
		{
			"sequence": movement_sequence,
			"axisX": clampf(axis_x, -1.0, 1.0),
			"axisY": clampf(axis_y, -1.0, 1.0)
		}
	)


func _on_game_client_error(code: int, message: String) -> void:
	world_connected = false
	_set_status("Colyseus client error %d: %s. Request a fresh ticket to retry." % [code, message])


func _on_room_error(code: int, message: String) -> void:
	world_connected = false
	_set_status("World room rejected the connection (%d): %s" % [code, message])


func _on_room_left(code: int, reason: String) -> void:
	world_connected = false
	if not access_token.is_empty():
		_set_status("Left the world room (%d): %s" % [code, reason])


func _on_game_client_disconnected() -> void:
	world_connected = false


func _disconnect_game_client(clear_ticket: bool = true) -> void:
	if clear_ticket:
		pending_join_ticket = ""
	world_connected = false
	last_world_snapshot.clear()
	movement_sequence = 0
	last_move_sent_at_ms = 0
	game_room = null
	if game_client != null:
		if game_client.has_method("close_connection"):
			game_client.call("close_connection")
		game_client.queue_free()
		game_client = null


func _exit_tree() -> void:
	_disconnect_game_client()

