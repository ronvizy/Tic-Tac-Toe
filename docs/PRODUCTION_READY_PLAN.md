# Tic-Tac-Toe Production Ready Plan

## Goal

Ship a production-ready Tic-Tac-Toe app with:

- Username/password login and signup
- Realtime global chat
- Realtime room chat for players inside a room
- Shareable room IDs in global chat
- One-click join from shared room IDs
- Offline and online gameplay

## Core User Flows

### 1. Signup

- User enters `username` and `password`
- App checks whether the username already exists
- If taken, app shows available username suggestions
- On success, user is signed in immediately

### 2. Login

- User enters `username` and `password`
- App validates credentials
- On success, user receives a session token
- Session persists across refreshes until logout or expiry

### 3. Global Chat

- Logged-in users join the global chat automatically
- Messages appear in realtime for all connected users
- Global chat shows:
  - sender username
  - message text
  - timestamp
- Users can post room IDs in chat

### 4. Room Creation

- Logged-in user creates a room
- Server generates a unique room ID
- Room ID is shown in the UI
- User can share the room ID into global chat

### 5. Room Join

- Logged-in user enters a room ID manually or clicks a shared room link from chat
- Server validates the room
- If valid and not full, user joins the room
- If invalid/full, user sees a clear error

### 6. Room Chat

- Users inside the same room can chat in realtime
- Room chat is separate from global chat
- Room chat is visible only to users in that room

### 7. Gameplay

- Offline mode works without sockets
- Online mode uses realtime sync
- Game state stays consistent between both room players
- Restart flow works safely

## Product Requirements

### Authentication

- Unique usernames only
- Password hashing with a strong algorithm
- Session token expiry
- Logout support
- Rate limiting for signup/login
- Input validation and sanitization

### Global Chat

- Realtime delivery
- Message persistence
- Message length limit
- Basic moderation protections
- Prevent spam/flooding
- Auto-scroll and unread handling

### Room Chat

- Realtime delivery per room
- Separate event channel from global chat
- Persist recent room messages
- Clear room join/leave system messages

### Room Sharing

- Detect room codes in global chat
- Render shared room IDs as clickable join actions
- Confirm before joining if user is already in another room
- Handle expired or full rooms gracefully

### Online Game Rooms

- Unique room IDs
- Capacity rules
- Join/leave handling
- Reconnect behavior
- Abandoned room cleanup
- Match state recovery where possible

## Backend Work

### API

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/availability?username=...`

### Socket Events

#### Global

- `chat:history`
- `chat:message`
- `chat:send`

#### Room Presence

- `room:create`
- `room:join`
- `room:leave`
- `room:update`

#### Room Chat

- `room:chat:history`
- `room:chat:message`
- `room:chat:send`

#### Gameplay

- `game:move`
- `game:restart`

### Persistence

Current JSON storage is fine for local development, but production should move to a real database.

Recommended:

- PostgreSQL for users, rooms, memberships, chat messages
- Redis for socket presence, pub/sub, rate limiting, transient room state

## Frontend Work

### Auth UI

- Login tab
- Signup tab
- Username availability status
- Suggested usernames
- Persistent session handling

### Global Chat UI

- Right-side chat panel
- Realtime messages
- Clickable room IDs
- Join-room CTA in message cards

### Room Chat UI

- Separate room chat panel or tab
- Show room members
- Show room ID copy/share action

### Online Room UX

- Create room button
- Join room field
- Copy room ID button
- “Share to global chat” button
- Direct join from chat

## Security Requirements

- Store only password hashes, never raw passwords
- Use secure auth secret from environment
- Validate all socket payloads
- Sanitize usernames and chat messages
- Add rate limiting to auth and chat
- Add CORS policy for production domains
- Add HTTPS in deployment

## Production Readiness Checklist

### Must Have

- Replace JSON file storage with PostgreSQL
- Add Redis for scalable realtime events
- Add room chat events and UI
- Add clickable shared room IDs in global chat
- Add auth rate limiting
- Add validation layer for API and socket payloads
- Add structured logging
- Add environment-based config
- Add production build/start scripts
- Add error handling and user-friendly toast messages

### Should Have

- Reconnect handling for dropped sockets
- Presence indicators
- Typing indicators in chat
- Message moderation tools
- Admin controls
- Analytics and monitoring

### Nice To Have

- Password reset
- Profile avatars
- Friends/invite system
- Match history
- Leaderboard

## Suggested Milestones

### Milestone 1

- Stable login/signup
- Username suggestions
- Global chat in realtime

### Milestone 2

- Room creation/join
- Share room ID in global chat
- Click-to-join room from global chat

### Milestone 3

- Room-only chat
- Reconnect flow
- Better error states

### Milestone 4

- Database migration
- Redis/pub-sub
- Deployment hardening

## Recommended Next Build Order

1. Finish and polish auth flow
2. Add room chat backend and UI
3. Make room IDs clickable in global chat
4. Add direct join flow from chat messages
5. Move storage to PostgreSQL
6. Add Redis-backed realtime infrastructure
7. Harden deployment, logging, monitoring, and rate limiting

## Notes

- Global chat and room chat should be separate channels
- Sharing room IDs in chat should feel instant and frictionless
- Direct join from chat is a key viral loop for the app
- For true production scale, file-based JSON storage should not be used
