# Room Chat And Sharing Spec

## Feature Summary

Users in the app should be able to:

- chat in the global lobby
- create a room
- share the room ID in global chat
- let other users click the shared room ID and join directly
- chat privately with users inside the room

## Chat Message Types

### Global Chat Message

- `id`
- `username`
- `userId`
- `text`
- `createdAt`
- `sharedRoomId` optional

### Room Chat Message

- `id`
- `roomId`
- `username`
- `userId`
- `text`
- `createdAt`

## Room Share UX

### From Room Screen

- User clicks `Share Room`
- Client sends a global chat message with:
  - normal text
  - attached `sharedRoomId`

### In Global Chat

- Shared room messages render a highlighted room card
- Card shows:
  - room ID
  - who shared it
  - join button

### Join Action

- User clicks `Join Room`
- Client checks if user is already in a room
- If yes, prompt user before leaving current room
- Client emits room join event
- On success, user lands in the room immediately

## Socket Events

### Global Chat

- `chat:send`
- `chat:message`
- `chat:history`

### Room Chat

- `room:chat:send`
- `room:chat:message`
- `room:chat:history`

### Room Sharing

- reuse `chat:send` with optional `sharedRoomId`

## Validation Rules

- Room ID must be valid and active
- Room must not be full
- Shared room card must show disabled state if room is unavailable
- Message text length should be capped
- Shared room ID must be sanitized

## Backend Notes

- Keep recent room messages in storage
- Broadcast room chat only to sockets in that room
- Broadcast global chat to all authenticated sockets
- Add room metadata lookup for join cards

## Frontend Notes

- Parse and render `sharedRoomId`
- Make join action obvious and fast
- Keep room chat separate from lobby chat
- Preserve existing Tic-Tac-Toe visual style
