# Vendored Colyseus Godot Client

- Upstream: https://github.com/sergeknystautas/colyseus-godot-sdk
- Pinned upstream commit: `f17b084414a65e88b822cebdaa285cf9e1b80556`
- License: MIT; see `LICENSE` in this directory.
- Vendored as GDScript source to avoid the editor-shutdown crash observed with the official native GDExtension beta `godot-v0.18.7`.
- Upstream describes compatibility with Colyseus 0.15.x. This repository's current server uses `@colyseus/core` and `@colyseus/ws-transport` 0.16.x. We have verified this pinned client against the current server for HTTP matchmaking, WebSocket room admission, one-time join-ticket validation and receipt of `S2C_RoomJoinSuccess`. This is not a blanket compatibility guarantee for Colyseus schema serialization, reconnection, remote-player rendering or other SDK/server versions.
- Local patch: `ColyseusClient.connect_to_server` skips an HTTP root probe and defers the `connected` signal; the matchmake request is the actual connectivity check. This avoids waiting indefinitely on the root path of the current Colyseus 0.16 transport.
- Local security patch: removed debug logs that exposed reconnection tokens, session IDs, WebSocket URLs and complete room-message payloads.
- Do not update this code without recording the upstream commit, reviewing the diff and rerunning the Godot-to-server integration smoke test.
