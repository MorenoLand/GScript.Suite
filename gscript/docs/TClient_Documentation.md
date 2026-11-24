# TClient and StartScript documentation

The `TClient_*` functions, the `TClient` instance and the StartScript weapons that drive them, as the Graal client defines them.

## Index

- [Overview](#overview)
- [Conventions](#conventions)
- [TClient_* functions](#tclient_-functions)
  - [Building the client and its connection](#building-the-client-and-its-connection)
  - [All TClient_* functions](#all-tclient_-functions)
- [TClient instance functions](#tclient-instance-functions)
  - [Connection and protocol](#connection-and-protocol)
  - [SSL and encryption](#ssl-and-encryption)
  - [Account](#account)
  - [Sending data](#sending-data)
  - [Data handlers](#data-handlers)
- [Standard incoming handler table](#standard-incoming-handler-table)
  - [Special handler indexes](#special-handler-indexes)
  - [Special case: defaultInHandler](#special-case-defaultinhandler)
- [Examples: data in and out handlers](#examples-data-in-and-out-handlers)
  - [Outgoing handlers](#outgoing-handlers)
  - [Incoming handlers](#incoming-handlers)
  - [Login sequence, old protocol](#login-sequence-old-protocol)
  - [Login sequence, new protocol](#login-sequence-new-protocol)
  - [Helper functions of the connector](#helper-functions-of-the-connector)
- [Events](#events)
  - [TClient events](#tclient-events)
  - [Events of StartScript_Connector](#events-of-startscript_connector)

## Overview

StartScript weapons are special scripts that load into the Graal client as soon as it starts, before connecting to any online server. At this stage the client is effectively connected to an internal "Offline" server where these weapons are created. They handle the initial clientside setup, such as initializing the GUI and configuring networking with the `TClient_*` functions.

In V4+ clients the networking is scripted. These networking functions are only accessible within StartScript weapons (offline weapons) and cannot be used from regular weapons, including Login Server weapons. The Offline server environment has the highest level of script privileges and therefore needs to be kept restricted.

The StartScript weapons are bundled inside the Graal client. During startup the client also makes an HTTP request to a Graal server endpoint to download a file that looks like a PNG image but is a ZIP archive (`conf.gs`). The server generates and encrypts it with a private key that we do not have; the RSA public key used to decrypt it is stored in the client. The downloaded file is the `StartScript_Connector`, which activates the client. If the client fails to download or load it, it falls back to a failsafe connector bundled inside the client.

Known StartScript weapons:

- `StartScript_Connector`
- `StartScript_MessageBoxDialog`
- `StartScript_GraalGui`
- `StartScript_Fail`

## Conventions

- Names are case-insensitive.
- Argument types: `int`, `uint`, `double`, `str`, `bool`, `object`.
- In the client's function table every function whose name starts with `tclient_` has access level 2 and every `adventure_` function level 1. The level is stored with the function; the client does not check it when a script calls the function.

## TClient_* functions

### Building the client and its connection

| Function | Arguments | Description |
| --- | --- | --- |
| `TClient_createTClient("TClient_" @ md5(timevar2))` | `(str) -> object` | Client constructor, returns the client instance. Nothing new is made when the program already has one. |
| `TClient_deleteTClient(bool)` | `(bool)` | Deletes the current client instance. When the script created it, the game state is reset as well; the argument says whether the game restarts with another account. |
| `TClient_setConnectionAttributes(str, str, int)` | `(servername, hostip, hostport)` | Specifies where the client should connect to. |
| `TClient_setScript(str, str, int, str, str)` | `(type, type_name, script length, des_key, script_bytecode)` | A script the server sends. A weapon goes to the local player, a class to the script universe. |

### All TClient_* functions

The connector uses these to feed what the game server sent into the client: the level board and signs, NPC and player properties, bombs, horses and shots, file downloads, flags and the connection state.

| Function | Arguments | Parameters | Description |
| --- | --- | --- | --- |
| `TClient_addarrow` | `(int, double, double, int, int, int)` | id, x, y, flags, sprite, power | An arrow the server says was shot, put in the level of the shooter (the NPC with that number, else the local player).<br>Flags: bits 0-1 direction, 4 removes an arrow at that place first, 8 gives the arrow the NPC as shooter and layer |
| `TClient_addbomb` | `(int, double, double, int, int, str)` | id, x, y, flags, timer, image | A bomb the server says was put down.<br>Flags: bits 0-2 power, 8 makes the NPC the owner. timer is ticks until it explodes, image empty for the default bomb |
| `TClient_adddefaultweapon` | `(int)` | item | Gives the local player the weapon of that item number (not on an old server, nothing above 25) |
| `TClient_addexplosion` | `(int, int, double, double, int)` | id, armLength, x, y, flags | An explosion the server says happened. Power is the low 3 bits of flags (1 to 3), flag 8 makes the NPC the owner |
| `TClient_addextra` | `(double, double, int, int)` | x, y, kind, id | An item lying on the ground, dropped by the player or NPC with that id (negative for none) |
| `TClient_addhorse` | `(double, double, int, int, str)` | x, y, direction, bushes, image | A horse standing in the level (not on a Graal 2002 server) |
| `TClient_addlevelchest` | `(bool, int, int, int, int)` | open, x, y, item, sign | Puts a chest into the level (not on a Graal 2002 server); sign is the index of the sign text shown when opened |
| `TClient_addlevellink` | `(str)` | link | Adds a level link, given as a line of a level file, to the level the server sent |
| `TClient_addlevelsign` | `(int, int, str)` | x, y, text | Puts a sign with a text into the level |
| `TClient_createTClient` | `(str) -> object` | name | Makes the client's connection to the game server and returns it (nothing new when one exists) |
| `TClient_deleteallnpcs` | `(str)` |  | The client forgets all NPCs; the local player loses the weapons that are not kept |
| `TClient_deletelocalnpcs` | `(str)` |  | Destroys the NPCs of the current level whose numbers are 1 to 999 |
| `TClient_deletelocalnpc` | `(str, int)` | level, id | Destroys the NPC with that number in that level |
| `TClient_deletenpc` | `(int)` | id | Destroys the level-less NPC with that number |
| `TClient_deleteTClient` | `(bool)` | restart | Deletes the connection.<br>When the script created it the game state is reset as well;<br>restart says whether the game restarts with another account (passed on to that reset) |
| `TClient_deleteweapon` | `(str)` | name | Takes a weapon away from the local player |
| `TClient_downloadadddata` | `(uint, str, str)` | time, file, data | Adds a piece of a file the server is sending and reports the progress |
| `TClient_downloadend` | `(str)` | file | The file arrived completely; scripts get onFileDownloaded |
| `TClient_downloadimagefailed` | `(str)` | file | The server does not have a file the scripts asked for; it is cached as an empty file |
| `TClient_downloadimagewasok` | `(str)` | file | A file the scripts asked for has arrived completely |
| `TClient_downloadsetsize` | `(uint)` | size | The size in bytes the server announced for the file being downloaded |
| `TClient_downloadstart` | `(str)` | file | The server starts to send a file; its data starts afresh |
| `TClient_freezeplayer` | `(str)` |  | The server freezes the local player for 600 ticks (not on a Graal 2002 server) |
| `TClient_gethavewindow` | `(str)` | name | The server asks whether a window whose title contains the text is open; the answer is sent back |
| `TClient_getwindowlist` | `(str)` |  | The server asks for the titles of the open windows; they are sent back as one comma list |
| `TClient_hurtbaddy` | `(int, double, double, int)` | id, directionX, directionY, damage | Hurts the baddy the server numbered |
| `TClient_playerwarped2` | `(double, double, double, int, int, str)` | x, y, z, column, row, gmap | The server warps the local player to a position in a level of a gmap |
| `TClient_playerwarped` | `(double, double, str)` | x, y, level | The server warps the local player to a position in a level |
| `TClient_pushaway` | `(double, double)` | x, y | The server pushes the player; the direction is kept as the direction of the last hit |
| `TClient_readsign` | `(str)` | text | The server makes the local player read a sign; the player is paused and stops walking |
| `TClient_receivetext` | `(str, str, str, str)` | name, request, argument, text | Handles a text of the server that a script passes on; the text is split into lines |
| `TClient_removebomb` | `(double, double)` | x, y | Removes the bomb at that position from the player's level |
| `TClient_removeextra` | `(double, double)` | x, y | Removes the item lying there and plays the sound of taking it |
| `TClient_removehorse` | `(double, double)` | x, y | Removes the horse at that position (not on a Graal 2002 server) |
| `TClient_setadminmessage` | `(str)` | text | Shows a message from the administrators in the message box |
| `TClient_setbaddyprops` | `(int, str)` | id, properties | Gives the baddy the server numbered the encoded properties it sent |
| `TClient_setboardmodify2` | `(str)` | data | Changed tiles of a level of the gmap the player is on; the first two characters (less 32) are the level's position in the gmap |
| `TClient_setboardmodify` | `(str)` | tiles | Changed tiles of the level the player is in, as the server sends them |
| `TClient_setcarrythrown` | `(int)` |  | Throws what the local player carries |
| `TClient_setConnectionAttributes` | `(str, str, int)` | servername, hostip, hostport | Sets the server to connect to |
| `TClient_setcookie` | `(str)` | text | Saves the cookie the server sent |
| `TClient_setdisconnectmessage` | `(str)` | text | The message to show when the server disconnects the player |
| `TClient_setencryptionin` | `(str, str, str)` | ciphertype, cipherkey, initvector | Sets the cipher of the data coming in |
| `TClient_setfilekey` | `(str, int, str)` | name, number, text | Stores the key the server gave for a file |
| `TClient_setfileredirect` | `(uint, str, str)` | flags, file, url | The server says a file is to be fetched from a web address |
| `TClient_setfileupdate` | `(str)` | file | The server says a file has changed; it is requested again if the client had asked for it before |
| `TClient_setfirespy` | `(int, int)` | id, packed | A player or NPC spies with the fire; packed is eight times the length of the row of flames plus their strength |
| `TClient_setflagdata` | `(str)` | flag | The server sets a flag, given as its text |
| `TClient_setfolderlog` | `(str)` | line | A line of the folder log; scripts get onFolderLog |
| `TClient_setganidata` | `(str, str)` | name, data | Gives a loaded animation the description (the lines of the animation file) the server sent |
| `TClient_setganiscript` | `(str, str)` | name, script | Gives an animation the compiled script the server sent |
| `TClient_setghostmessage` | `(str)` | text | The message of the server for a ghost player |
| `TClient_setghostsnear` | `(bool)` | shown | Whether the ghost icon is shown |
| `TClient_setgraal2002server` | `(str)` |  | Notes that the server is a Graal 2002 server |
| `TClient_setisghost` | `(int)` | value | Stores the "is ghost" value the server sent |
| `TClient_setisleader` | `(str)` |  | Notes that the local player is the leader of the level the server sent |
| `TClient_setlevelboard` | `(str)` | board | The board of the level the local player is in, as the server sent it |
| `TClient_setlevelfailed` | `(str)` |  | The level the player tried to enter could not be loaded; the failure is shown for 40 ticks |
| `TClient_setlevelheights` | `(int, int, int, int, int, int, str)` | x, y, gridX, gridY, width, height, heights | Heights of the terrain for a part of a level of the gmap; two characters per corner (whole part less 82, then 128ths less 32) |
| `TClient_setlevelmodtime` | `(uint)` | stamp | Sets the modification time of the level |
| `TClient_setnewprojectile` | `(int, double, double, double, double, double, double, double, str, str, str)` | id, x, y, z, angle, elevation, speed, gravity, animation, animationParameters, shotParameters | A projectile with its own gravity, shot in the player's level |
| `TClient_setnpclevel` | `(str)` | name | The level or gmap that the NPCs the server sends next belong to |
| `TClient_setnpcmove` | `(int, str)` | id, properties | Handled like setnpcprops |
| `TClient_setnpcprops` | `(int, str)` | id, properties | The properties of the NPC with that number; the NPC is made if the client does not know it |
| `TClient_setnpcremoved` | `(int, double, double, str)` | id, x, y, level | Moves an NPC into another level at a position, or into no level when the name is empty |
| `TClient_setnpcscript` | `(int, str)` | id, bytecode | Gives an NPC the compiled script the server sent and runs it |
| `TClient_setotherplayerprops` | `(int, str)` | id, properties | The properties of a player who is not the local one; a new player is made, a player that leaves triggers onPlayerLogout |
| `TClient_setpackageend` | `(str)` | name | An update package was sent completely; scripts get onUpdatePackageDownloaded |
| `TClient_setpackagestart` | `(str, int)` | name, size | The download of an update package has begun |
| `TClient_setping` | `(int, int)` | kind, value | Kind 0 asks for an answer, kind 1 reports the ping time |
| `TClient_setplayerhurt` | `(int, double, double, double, int)` | id, pushX, pushY, power, source | An attacker hurt the local player; source is the NPC number, or negative for a player |
| `TClient_setplayerprops` | `(str)` | properties | The properties of the local player, as the server sent them |
| `TClient_setprivatemessage` | `(int, str)` | id, text | A private message from a player; scripts get onPM |
| `TClient_setrawboard2` | `(str)` | patches | Changes to the board in the packed form |
| `TClient_setrawboard` | `(str)` | board | The board of the level in the packed form |
| `TClient_setrawlen` | `(int)` | length | The next classic line is a raw block of this length |
| `TClient_setrclog` | `(str)` | line | A line of the remote control log; scripts get onRCChat |
| `TClient_setregged` | `(str)` |  | Notes that the player's account is a registered one |
| `TClient_setrpgmessage` | `(str)` | text | Shows an RPG message in the game console |
| `TClient_setScript` | `(str, str, int, str, str)` |  | Type, type_name, script length, des_key, script_bytecode: a script the server sends;<br>a weapon goes to the local player, a class to the script universe |
| `TClient_setscriptchecksum` | `(str, str, int, str, uint)` | type, name, mode, key, checksum | The checksum of a script instead of the script; the copy kept on disk is used when it matches |
| `TClient_setserverlevel` | `(str)` | name | The level the server is talking about from now on |
| `TClient_setserverlisterconnect` | `(str)` |  | The client reached the server lister; scripts get onServerListerConnect |
| `TClient_setserveroptions` | `(int)` | options | Stores the options the server sent |
| `TClient_setserversignature` | `(int)` | number | Stores the server's signature number; scripts get onServerLogin |
| `TClient_setserverwarp` | `(str)` | text | The server and level the player is to be moved to |
| `TClient_setstaffguilds` | `(str)` | guilds | The guilds whose members count as staff, separated by commas |
| `TClient_setstatusicons` | `(str)` | names | The status icons the server offers, separated by commas |
| `TClient_settimevar` | `(uint)` | time | Stores the world's time variable the server sent |
| `TClient_settoallmsg` | `(int, str)` | id, message | A player says something to everybody; scripts get onToall |
| `TClient_settriggeraction` | `(int, int, double, double, str, str)` | npcId, playerId, x, y, action, parameters | The server raised an action; "clientside" goes to the local player's weapons |
| `TClient_setweapon` | `(str, str)` | name, properties | Gives the local player a weapon, or updates the one with that name |
| `TClient_unfreezeplayer` | `(str)` |  | Ends the freezing of the player |
| `TClient_unsetflagdata` | `(str)` | flag | The server clears a flag |

## TClient instance functions

These are called on the object `TClient_createTClient` returned, for example `this.client.connectToGameServer()`.

### Connection and protocol

| Function | Returns | Description |
| --- | --- | --- |
| `connectToGameServer()` | `bool` | Connects to the game server. True when the connection is being made. |
| `setProtocol(str)` | | Describes the frame header of the connection with a template. |

`connectToGameServer()` marks the connection as failed, and sets "could not connect" as the disconnect message, when there is no host, no port above 0, or the socket closes at once.

`setProtocol(template)` takes a template as long as the header, for example `EILLLT`:

| Letter | Field |
| --- | --- |
| `I` | sequence number |
| `L` | length |
| `T` | type (packet id) |
| `E` | compression kind (earlier notes call it Encryption) |

The first occurrence of a letter gives the field's position, up to four equal letters in a row give its width (each letter is a byte), and a missing letter means the field is absent. The template is usable when it has a length and a type.

### SSL and encryption

| Function | Returns | Description |
| --- | --- | --- |
| `setSSLParameters(bool, str, str, str)` | | `usessl`, key file, certificate file, cipher list. The cipher list is DES-encrypted; the client decrypts it with a key built into the client. |
| `getSSLCipher()` | `str` | The cipher the TLS connection uses; empty without a socket. |
| `getSSLSubject()` | `str` | The subject of the server's certificate; empty without a socket. |
| `getSSLIssuer()` | `str` | The issuer of the server's certificate; empty without a socket. |
| `setEncryptionParseKey(str)` | | Sets the string the client parses for the encryption. |
| `setEncryptionOut(str, str, str)` | | `ciphertype`, `cipherkey`, `initvector` (AES only). Sets the cipher that encrypts everything sent from now on; data already buffered is flushed first with the old cipher. |

### Account

| Function | Returns | Description |
| --- | --- | --- |
| `setLoginAccount(str)` | | `accountid`: remembers the account name the client logs in with. |
| `getPassword()` | `str` | The password the client offers, in plain text; empty when none was set. |
| `requestBaseFiles()` | | Asks for the files the client needs to start (details below). |

`requestBaseFiles()`:

1. The update packages start again.
2. Unless a script handles file requests, the first 10 of the wanted files are requested and the first 10 of the files to update are checked for being up to date.
3. The files of the local player's gmap and of its minimap list are wanted, or checked for an update when the client already has them.

### Sending data

| Function | Returns | Description |
| --- | --- | --- |
| `sendData(int, str)` | | `packetid`, `data`: sends data to the server. The id is the packet id on the wire; it does not go through the outgoing handler table. |
| `sendRaw(str)` | | Sends the text as a packet of type -1 (without a type). Used for the `PLI_RAWDATA` packet. DEPRECATED since the protocol change in later versions of v6. |
| `flush()` | | Sends what the connection has queued. |

### Data handlers

| Function | Returns | Description |
| --- | --- | --- |
| `setInDataHandlers(array)` | | Installs the incoming packet handlers from an array of pairs `original_packetid, index_num` (see the [handler table](#standard-incoming-handler-table)). A last element without a partner is ignored; an array of fewer than two elements does nothing. |
| `clearInDataHandlers()` | | Removes the handler of every kind of incoming packet. |
| `defaultInHandler(int, str)` | | `index`, `data`: runs the standard handler of that index (0 to 94) on the data. Nothing happens for an index without a standard handler or outside the table. It takes the handler index, not the raw packet id. |
| `setOutDataHandlers(array)` | | Sets the packet ids the client sends: element *i*, cut to a whole number, is the packet id for the kind of message *i* (see [Outgoing handlers](#outgoing-handlers)). |
| `clearOutDataHandlers()` | | Listed in earlier notes; the client program does not register it, so it is unconfirmed. |

## Standard incoming handler table

The index of `setInDataHandlers` and the first argument of `defaultInHandler`. Index 0 to 94. Where the handler is a script function of its own the `TClient_*` function is named; the others read the packet inside the client and are named by what they handle.

| Index | Handler | Kind |
| ---: | --- | --- |
| 0 | `TClient_setserverwarp` | script function |
| 1 | `TClient_setplayerprops` | script function |
| 2 | NPC weapon added | handled inside the client |
| 3 | script checksum | handled inside the client |
| 4 | script data | handled inside the client |
| 5 | `TClient_deleteweapon` | script function |
| 6 | `TClient_setflagdata` | script function |
| 7 | `TClient_unsetflagdata` | script function |
| 8 | trigger action | handled inside the client |
| 9 | `TClient_setdisconnectmessage` | script function |
| 10 | signature | handled inside the client |
| 11 | server options | handled inside the client |
| 12 | `TClient_setadminmessage` | script function |
| 13 | `TClient_setgraal2002server` | script function |
| 14 | `TClient_setserverlisterconnect` | script function |
| 15 | `TClient_getwindowlist` | script function |
| 16 | `TClient_gethavewindow` | script function |
| 17 | `TClient_setcookie` | script function |
| 18 | new world time | handled inside the client |
| 19 | `TClient_downloadimagefailed` | script function |
| 20 | `TClient_downloadimagewasok` | script function |
| 21 | `TClient_downloadstart` | script function |
| 22 | large file size | handled inside the client |
| 23 | `TClient_downloadend` | script function |
| 24 | file data | handled inside the client |
| 25 | `TClient_setfileupdate` | script function |
| 26 | file key | handled inside the client |
| 27 | file redirect | handled inside the client |
| 28 | `TClient_setrclog` | script function |
| 29 | `TClient_setfolderlog` | script function |
| 30 | server text | handled inside the client |
| 31 | player warp | handled inside the client |
| 32 | player warp 2 | handled inside the client |
| 33 | `TClient_setserverlevel` | script function |
| 34 | `TClient_setlevelfailed` | script function |
| 35 | other player properties | handled inside the client |
| 36 | gani script | handled inside the client |
| 37 | gani data | handled inside the client |
| 38 | `TClient_setregged` | script function |
| 39 | is ghost | handled inside the client |
| 40 | `TClient_setghostmessage` | script function |
| 41 | ghost icon | handled inside the client |
| 42 | `TClient_setstaffguilds` | script function |
| 43 | `TClient_setstatusicons` | script function |
| 44 | `TClient_setrpgmessage` | script function |
| 45 | `TClient_readsign` | script function |
| 46 | NPC delete | handled inside the client |
| 47 | `TClient_deleteallnpcs` | script function |
| 48 | `TClient_setlevelboard` | script function |
| 49 | `TClient_setrawboard` | script function |
| 50 | `TClient_setrawboard2` | script function |
| 51 | `TClient_setboardmodify` | script function |
| 52 | `TClient_setboardmodify2` | script function |
| 53 | `TClient_setnpclevel` | script function |
| 54 | `TClient_setisleader` | script function |
| 55 | `TClient_addlevellink` | script function |
| 56 | NPC bytecode | handled inside the client |
| 57 | NPC properties | handled inside the client |
| 58 | NPC move | handled inside the client |
| 59 | NPC removed | handled inside the client |
| 60 | NPC delete 2 | handled inside the client |
| 61 | `TClient_deletelocalnpcs` | script function |
| 62 | shoot 2 | handled inside the client |
| 63 | hurt player | handled inside the client |
| 64 | hit objects | handled inside the client |
| 65 | push away | handled inside the client |
| 66 | `TClient_freezeplayer` | script function |
| 67 | `TClient_unfreezeplayer` | script function |
| 68 | level heights | handled inside the client |
| 69 | level modification time | handled inside the client |
| 70 | show image | handled inside the client |
| 71 | NPC show image | handled inside the client |
| 72 | minimap | handled inside the client |
| 73 | to-all message | handled inside the client |
| 74 | private message | handled inside the client |
| 75 | level chest | handled inside the client |
| 76 | level sign | handled inside the client |
| 77 | default weapon | handled inside the client |
| 78 | arrow added | handled inside the client |
| 79 | bomb added | handled inside the client |
| 80 | bomb deleted | handled inside the client |
| 81 | explosion | handled inside the client |
| 82 | fire spy | handled inside the client |
| 83 | throw carried | handled inside the client |
| 84 | item added | handled inside the client |
| 85 | item deleted | handled inside the client |
| 86 | horse added | handled inside the client |
| 87 | horse deleted | handled inside the client |
| 88 | baddy properties | handled inside the client |
| 89 | baddy hurt | handled inside the client |
| 90 | no handler | handled inside the client |
| 91 | package start | handled inside the client |
| 92 | `TClient_setpackageend` | script function |
| 93 | raw data (runs immediately) | handled inside the client |
| 94 | ping (runs immediately) | handled inside the client |

### Special handler indexes

| Index | Meaning |
| ---: | --- |
| 252 (`0xFC`) | The encryption-key handler. |
| 253 (`0xFD`) | Marks the packet id that holds further frames. |
| 254 (`0xFE`) | Hands the packet to the script as an `onData` event. |
| 255 (`0xFF`) | Removes the handler. |
| 95 to 251 | Change nothing. |

Indexes 93 and 94, and the `0xFC` key handler, run as soon as the packet is read, on the network thread, instead of waiting for the game thread.

### Special case: defaultInHandler

`defaultInHandler` does not work directly with raw packet ids. The packet ids are remapped internally, so ids from old leaked GServer sources, or ones dumped from the game stream, do not work as they are. Instead, `setInDataHandlers` defines the handlers. It expects mappings in the format `{original_packet_id, index_number, ...}`:

- `original_packet_id` is the raw id you are familiar with.
- `index_number` points to an internal array of packet handler functions inside the client.

The `StartScript_Connector` weapon sets these mappings up during the client's startup, which handles the initialization and the remapping.

## Examples: data in and out handlers

The numbers are the ones the real `StartScript_Connector` uses. Long keys are shortened to `<...>`.

### Outgoing handlers

`TClient.setOutDataHandlers(array)`: the array is indexed by the kind of message the client sends on its own (asking for a script, a flag, a warp, a chat line, ...). Element *i* is the packet id that kind is sent with. A kind that is not in the array gets -1, "no such message". At most 256 entries are used.

| Kind | Message | Kind | Message | Kind | Message |
| ---: | --- | ---: | --- | ---: | --- |
| 0 | ask for a weapon script | 1 | ask for a class script | 2 | ask for a gani script |
| 3 | say something to all players | 4 | is-PKer | 5 | carry thrown |
| 6 | add horse | 7 | delete horse | 8 | add bomb |
| 9 | delete bomb | 10 | server warp | 11 | trigger action |
| 12 | fire spying | 13 | explosion | 14 | weapon hit |
| 15 | player hurt | 16 | delete NPC | 17 | delete weapon |
| 18 | item add | 19 | item take | 20 | item delete |
| 21 | open chest | 22 | shot | 23 | baddy properties |
| 24 | baddy hurt | 25 | weapon image | 26 | RC chat |
| 27 | request text | 28 | set text | 29 | file delete |
| 30 | folder delete | 31 | file rename | 32 | files move |
| 33 | have window | 34 | enter level | 35 | want file |
| 36 | update file | 37 | update file checksum | 38 | level warp |
| 39 | level warp with modification time | 40 | download file | 41 | board modify |
| 43 | preload level | 44 | player properties | 46 | flag set |
| 47 | flag delete | 48 | projectile | 49 | update package |
| 50 | private message | 51 | upload start | 52 | save file |
| 53 | upload end | 55 | ping answer | 56 | window list |

Kinds 42, 45, 54 and 57 are not named.

```gs2
this.client.setOutDataHandlers({158, 161, 157, 6, 14, 11, 7, 8, 4, 5, 41, 38, 10, 27, 36, 26, <...>});
```

Read it as:

| Index | Packet id | Kind |
| ---: | ---: | --- |
| 0 | 158 | ask for a weapon script |
| 1 | 161 | ask for a class script |
| 2 | 157 | ask for a gani script |
| 3 | 6 | say something to all players |
| 4 | 14 | is-PKer |
| 5 | 11 | carry thrown |
| 6 | 7 | add horse |
| 7 | 8 | delete horse |
| 8 | 4 | add bomb |
| 9 | 5 | delete bomb |
| 10 | 41 | server warp |
| 11 | 38 | trigger action |
| 12 | 10 | fire spying |
| 13 | 27 | explosion |
| 14 | 36 | weapon hit |
| 15 | 26 | player hurt |

and so on up to index 57. The old and the new protocol use the same 58 numbers.

Packets you send yourself with `sendData(id, data)` use the packet id directly and do not go through this table. The connector sends the login as packet 5, the language as packet 37 and the encryption key as packet 252:

```gs2
this.client.sendData(5, temp.clientversion @ get1PlusTextNetString(temp.account) @ get1PlusTextNetString(temp.password) @ idlist);
this.client.sendData(37, $pref::Graal::language);
this.client.sendData(252, temp.keydata);
```

### Incoming handlers

`TClient.clearInDataHandlers()` and `TClient.setInDataHandlers(array)`: the array is a list of pairs, the packet id as the server sends it and then the index of the handler the client runs for that packet (see the [handler table](#standard-incoming-handler-table)). Clear the table first, then install the pairs:

```gs2
this.client.clearInDataHandlers();
temp.handlertime = 18;
this.client.setInDataHandlers({178, 0, 9, 1, 33, 2, 197, 3, 140, 4, 34, 5, 28, 6, 31, 7, 48, 8, 16, 9, 25, 10,
  198, 11, 35, 12, 176, 13, 190, 14, 182, 15, 183, 16, 111, 17, 42, temp.handlertime, 30, 19, <...>});
```

A variable may stand in for any element; the real script writes the handler index 18 as `temp.handlertime`. Read the pairs as:

| Packet id | Handler index | Handler |
| ---: | ---: | --- |
| 178 | 0 | TClient_setserverwarp |
| 9 | 1 | TClient_setplayerprops |
| 33 | 2 | NPC weapon added |
| 197 | 3 | script checksum |
| 140 | 4 | script data |
| 34 | 5 | TClient_deleteweapon |
| 28 | 6 | TClient_setflagdata |
| 31 | 7 | TClient_unsetflagdata |
| 48 | 8 | trigger action |
| 16 | 9 | TClient_setdisconnectmessage |
| 25 | 10 | signature |
| 198 | 11 | server options |
| 35 | 12 | TClient_setadminmessage |
| 176 | 13 | TClient_setgraal2002server |
| 190 | 14 | TClient_setserverlisterconnect |
| 182 | 15 | TClient_getwindowlist |
| 183 | 16 | TClient_gethavewindow |
| 111 | 17 | TClient_setcookie |
| 42 | 18 | new world time |
| 30 | 19 | TClient_downloadimagefailed |

There is one pair for every handler index in order up to 94; packet 108 -> handler 94 (ping) is the last real pair.

The two protocols differ at the end of the list:

| Protocol | End of the list | Meaning |
| --- | --- | --- |
| Old | `..., 105, 91, 106, 92, 100, 93, 108, 94` | Packet 100 -> handler 93 (raw data) is installed. |
| New | `..., 105, 91, 106, 92, 108, 94, 252, 252, 253, 253` | No raw-data pair. Packet 252 -> `0xFC` makes it the encryption-key packet; packet 253 -> `0xFD` makes it the packet that holds further frames. |

Handing a packet to the script instead (illustrative; the real connector does not use it), and running one standard handler by hand (the number is the handler index, not the packet id):

```gs2
this.client.setInDataHandlers({150, 254});            // packet 150 arrives in onData
function onData(packetid, packetdata) {
  echo(packetid @ ": " @ packetdata);
}

this.client.defaultInHandler(12, "Server restarts in 5 minutes");   // handler 12: admin message
```

### Login sequence, old protocol

```gs2
TClient_setConnectionAttributes("Login", "<host>", <port>);     // where to connect: server name, host, port
this.client = TClient_createTClient("TClient_" @ md5(timevar2)); // returns the client instance
// setOutDataHandlers, clearInDataHandlers, setInDataHandlers as above
this.client.connectToGameServer();
this.client.setLoginAccount(temp.account);                     // "guest" or the stored account name
// password: for guests des_decrypt of a fixed 8-character code, otherwise this.client.getPassword()
this.client.sendData(5, <client version> @ get1PlusTextNetString(temp.account) @ get1PlusTextNetString(temp.password) @ <system id list>);
this.client.flush();
this.client.sendData(37, $pref::Graal::language);
this.client.requestBaseFiles();
this.client.flush();
```

The system id list is the platform name followed by `Adventure_getSystemID(0)` to `Adventure_getSystemID(3)`. The client version string depends on the platform:

| Platform | Client version |
| --- | --- |
| `win` | `G3D2204D` |
| `mac` | `G3D2304D` |
| `linux` | `G3D2404D` |
| other | `G3D2504D` |

### Login sequence, new protocol

After `createTClient` and the handlers:

```gs2
this.client.setProtocol("EILLLT");                           // frame header layout
this.client.connectToGameServer();
this.client.sendRaw("GNP1905C");                            // the first bytes on the wire
this.client.flush();
this.client.setEncryptionParseKey(base64decode("<...>"));
temp.cipherkey = generate16ByteKey();                        // 16 random bytes
temp.initvector = generate16ByteKey();
temp.keydata = get1ByteNetString(<1 for RC4, 2 for AES, 0 otherwise>)
                @ get1PlusTextNetString(temp.cipherkey)
                @ get1PlusTextNetString(temp.initvector);
temp.keydata = rsa_encrypt(base64decode("<RSA public key, DER>"), temp.keydata);
this.client.sendData(252, temp.keydata);                     // the key packet
this.client.flush();
this.client.setEncryptionOut("RC4", temp.cipherkey, temp.initvector);   // everything sent from now on is encrypted
// then the login packet as in the old protocol
```

### Helper functions of the connector

| Function | Result |
| --- | --- |
| `get1ByteNetString(val)` | `char(32 + val)`; `val` is held at 223. |
| `get1PlusTextNetString(str)` | `char(32 + length)` followed by the text; a text over 223 characters becomes `char(255)` followed by its first 223 characters. |
| `get4ByteFromNetString(str)` | Reads four characters as a number: each character minus 32, shifted by 21, 14, 7 and 0 bits. |
| `generate8ByteKey()` / `generate16ByteKey()` | That many random characters, `char(int(random(0, 256)))` each. |

## Events

### TClient events

| Event | Description |
| --- | --- |
| `onData(packetid, packetdata)` | a packet whose handler index is 254 (0xFE) is handed to the script: the event gets an array of the packet number and its text |
| `onFolderLog(str)` | scripted RC file browser message |
| `onFilesUploaded()` | finished uploading all files to the file browser |
| `onFileChunkReceived(str, int, int)` | file download progress: filename, current position, full size |
| `onPlayerLogin(object, int)` | a player logged in: player object and id |
| `onPlayerLogout(object, int)` | a player logged out: player object (might be NULL) and id |
| `onToall(object, str)` | received a toall message: player object and message |
| `onPlayerChanges(object, int)` | the look of a player changed: player object and id |
| `onPM(object)` | received a PM from a player: player object |
| `onServerLogin()` | logged into a server |
| `onRCChat(str)` | scripted RC chat: text |
| `onServerListerConnect()` | a connection to the server-lister (central server) established |
| `onUpdatePackageDownloaded(object)` | downloaded an update package (.gupd): package object |
| `onPackagesDownloadComplete()` | all update packages (.gupd files) have been downloaded |
| `onConnectingToServer(str, str, int)` | connecting to: servername, address, port |

### Events of StartScript_Connector

The client raises these in the `StartScript_Connector` script object.

| Event | Description |
| --- | --- |
| `onServerLogin()` | Logged into a server. |
| `onDisconnected(reason, error, sslerror)` | The connection ended: the message, the socket state and the socket error. The real script uses error 1 or 2 on a guest login to try the next of its login servers. |
| `onServerWarp(servername, host, port)` | The server sends the player to another server: delete the client with `TClient_deleteTClient(false)`, set the new attributes with `TClient_setConnectionAttributes` and log in again. |
| `onReconnect()` | The connection has to be made again: `TClient_deleteTClient(false)`, `TClient_setConnectionAttributes`, log in again. |
