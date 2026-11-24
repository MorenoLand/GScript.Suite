# Adventure functions

Reference of the `Adventure_*` functions of the Graal client.

## Index

- [Overview](#overview)
- [Conventions](#conventions)
- [Set functions](#set-functions)
- [Get functions](#get-functions)
- [Files and downloads](#files-and-downloads)
- [Select-file dialog](#select-file-dialog)
- [Input events](#input-events)
- [Sound](#sound)
- [Windows, menus and installation](#windows-menus-and-installation)
- [Session](#session)
- [Registry](#registry)
- [Obsolete functions](#obsolete-functions)
- [Phone and unregistered functions](#phone-and-unregistered-functions)

## Overview

`Adventure_*` functions are powerful hidden, undocumented functions in the Graal client. They were created specifically to handle lower-level tasks and mostly to solve issues Stefan faced with the creation of the iPhone and Login Servers. They are not meant for general use and are only accessible under certain conditions.

One condition is that the client must connect to a server recognized internally as a Login Server. This usually means any server whose name starts with the prefix `login`, or simply the first server the client connects to. These Login Servers also have the second-highest level of scripting privileges.

## Conventions

- Names are case-insensitive.
- Argument types: `int`, `uint`, `double`, `str`, `bool`, `obj`.
- In the client's function table every function whose name starts with `adventure_` has access level 1 (`tclient_` functions have level 2). The level is stored with the function; the client does not check it when a script calls the function.
- "Not in this client" marks a function from earlier notes that the client program does not register.

## Set functions

Change a setting of the client or of the account.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_setAccountName` | `(str)` |  | Changes the account name in the account settings |
| `Adventure_setPassword` | `(str)` |  | Changes the password in the account settings. Default is "authbydevice" on iServers |
| `Adventure_setNickName` | `(str)` |  | Changes the nickname in the account settings and, when there is a player of this client, the nickname that player shows |
| `Adventure_setChat` | `(str)` |  | Lets the player say a line as if it had been typed into the chat box (Public Overhead Chat), then empties the chat box.<br>Nothing happens before the game object exists |
| `Adventure_setScriptedDownloadSystem` | `(bool)` |  | Enables/disables the scripted download system: whether scripts (or the game) handle the file requests.<br>Turning it on moves the waiting requests to the script;<br>setting the state it already has does nothing |
| `Adventure_setFrameTick` | `(int)` |  | Sets the time in milliseconds one frame of the main loop is counted as, which decides how fast animated pictures play |
| `Adventure_setTextEditText` | `(obj, str)` |  | Puts a text into a GUI textedit control and submits it (control, text). Nothing happens when the object is not a text field |
| `Adventure_setRemoveVars` | `(bool)` |  | Chooses whether old variables are removed on a new login |
| `Adventure_setCheatWindows` | `(str)` |  | Comma-separated titles of windows that count as cheating tools; the client then starts collecting the titles of the open windows (deprecated) |
| `Adventure_setGraalControlRecreate` | `(bool)` |  | Chooses whether the start script is loaded afresh |
| `Adventure_setFullscreen` | `(bool)` |  | Switches the game window to or from full screen (nothing without a window) |
| `Adventure_setControlBinding` | `(int, int, int)` |  | Binds a key to an action (action, bindSlot, keycode). bindSlot 0 is the first key of the action |
| `Adventure_setAllowRecordByScript` | `(bool)` |  | Chooses whether scripts may record video with startrecordvideo() |
| `Adventure_setFileModTime` | `(str, uint)` |  | Name, uint (modification time in seconds since 1970).<br>A name with a folder is looked up among the script-accessible folders;<br>a name without a folder is a resource file |
| `Adventure_setFileModTimeGlobal` | `(str, uint)` |  | Path on the disk, uint (modification time in seconds since 1970) |
| `Adventure_setFileContent` | `(str, str)` |  | Writes content to file (path, content string). v6 mobile: (str, str, int) - iOS only (not in this client) |
| `Adventure_setAllowedSocketsConnect` | `(str)` |  | Allows TSocket connections, str needs to be in format "ip:port" (not registered as a script function in this client) |
| `Adventure_setAllowedPortsBind` | `(str)` |  | Sets allowed ports for binding (not registered as a script function in this client) |

## Get functions

Read a setting or a piece of information.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_getFileContent` | `(str)` | string, empty for a missing file | Reads the whole content of a file on the disk |
| `Adventure_getFolder` | `(str, str, bool, bool)` | a new array of names | Folder (with its trailing delimiter), name pattern, include files (bool), include directories (bool) |
| `Adventure_getBuildTime` | `()` | string (this client: "Aug  8 2014 17:16:33") | Build time of current client |
| `Adventure_getFileModTimeGlobal` | `(str)` | uint, the modification time in seconds since 1970, 0 for a missing file | Path on the disk |
| `Adventure_getWindowList` | `()` | an array | Titles of the windows of the desktop |
| `Adventure_getSystemID` | `(int)` | string: 0 product id hash, 1 network id, 2 volume serial hash, 3 operating system version; empty for any other number | Which identification text |
| `Adventure_getApplicationFolder` | `(int)` | string: 1 the user folder, 2 the path of the program, any other number the data folder | Which folder |
| `Adventure_getOSID` | `()` | string | Operating system version as text |
| `Adventure_getMacAddress` | `()` | string, empty when no address was found | The computer's network address as six hexadecimal numbers separated by colons, each at least two characters wide padded with spaces, not zeros ("a" becomes " a") |
| `Adventure_getNetworkID` | `()` | string, 32 hexadecimal digits, empty when no address was found | Hash of the computer's network address |
| `Adventure_getEditNickName` | `()` | string | Gets the nickname the player has stored |
| `Adventure_getEditAccountNames` | `()` | array | Gets the account names the player has signed in with before |
| `Adventure_getControlBinding` | `(int, int)` | object with .keytext property, or null when there is none | Gets the binding of a key to an action (action, bindSlot) |
| `Adventure_getScriptedDownloadSystem` | `()` | bool, true when a script handles the file requests | Gets scripted download system state |
| `Adventure_getFrameTick` | `()` | int | Gets the time one frame of the main loop is counted as, in milliseconds |
| `Adventure_getServerIP` | `()` | string, empty without a connection | Gets the address of the game server the client is connected to, as dotted text |
| `Adventure_getInstallationPath` | `()` | string | Gets the folder the program is installed in |
| `Adventure_getIPhoneID` | `()` |  | IOS only (not in this client) |
| `Adventure_getAndroidDeviceModel` | `()` |  | Android only (not in this client) |
| `Adventure_getAndroidOSVersion` | `()` |  | Android only (not in this client) |

## Files and downloads

Files on the disk, and file requests to the game server.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_fileExists` | `(str)` | bool | Checks if a file or folder exists at a path on the disk |
| `Adventure_fileIsFolder` | `(str)` | bool | Checks if a path on the disk is a folder |
| `Adventure_fileSize` | `(str)` | int, 0 for a missing file | Gets file size in bytes |
| `Adventure_requestDownload` | `(str)` |  | Asks the game server for a file (name) - Used by IRC File Browser. Nothing without a connection |
| `Adventure_requestUpdateCRC` | `(str)` |  | Asks the game server whether a file (name) changed, by checksum. Nothing without a connection |
| `Adventure_requestUpdateModTime` | `(str)` |  | Asks the game server whether a file (name) changed, by modification time. Nothing without a connection |
| `Adventure_addFileToIgnore` | `(str)` |  | Adds a file name to the set of names a script is not told about when the file is wanted or updated |
| `Adventure_clearFilesToIgnore` | `()` |  | Empties that set of names |
| `Adventure_uploadFile` | `(str)` |  | Queues a file for upload to the server (nothing offline) |
| `Adventure_requestFilesMove` | `(str, str)` |  | Asks the server to move files into a folder (destination folder, files to move) - Used by IRC File Browser.<br>Nothing happens without a connection |
| `Adventure_requestFileDeletion` | `(str)` |  | Asks the server to delete a file (nothing offline) |
| `Adventure_requestFolderDeletion` | `(str)` |  | Asks the server to delete a folder (nothing offline) |
| `Adventure_requestFileRename` | `(str, str)` |  | Asks the server to rename a file (current name, new name). Nothing happens without a connection |

## Select-file dialog

The dialog that picks a file or folder.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_selectPath` | `(str)` | the window of the dialog, or null when there is none | Opens the dialog that chooses a folder, starting in the given folder |
| `Adventure_selectFileSelect` | `(str)` |  | The player chose an entry of the select-file dialog (name).<br>A folder is opened;<br>otherwise for an existing file, or in the dialogs that choose a name, the dialog is closed and what it was for is done: the file is offered to the scripts, the download is requested, the picture is saved, or the scripts are told the folder |
| `Adventure_selectFileSetFolder` | `(int)` |  | Makes one of the places the select-file dialog offers (by index) the folder it shows.<br>Nothing happens while the folder is being changed or for an index that is not in the list |
| `Adventure_selectFileSetFolderByText` | `(str)` |  | Makes a folder the one the select-file dialog shows, when it is one of the places the dialog offers |
| `Adventure_selectFileShowHiddenFiles` | `(bool)` |  | Tells the select-file dialog whether to list names that start with a dot |

## Input events

Make the game window handle a key or mouse event.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_invokeKeyEvent` | `(int, int, str, int)` |  | Makes the main window handle a key as if the keyboard had sent it (event type, key code, text, modifier).<br>Type 1 is down, 4 is repeat, anything else is up;<br>the key has no scan code.<br>Example: 2, VK_D, "", 0.<br>Nothing happens before the window exists |
| `Adventure_invokeMouseEvent` | `(int, int, double, double, int, bool)` |  | Makes the game window handle a mouse event (kind, button, x, y, modifier, useVideoArea).<br>Kind 3 is a move of the pointer: x and y are the position and, when useVideoArea is set, fractions of the area that is being recorded;<br>any other kind is a button event (1 pressed, 2 released).<br>Only the lowest byte of the modifier counts.<br>Nothing happens without a window |

## Sound

Apply the volume settings.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_updateMidiVolume` | `()` |  | Applies the MIDI volume setting to the music player (nothing without a music player) |
| `Adventure_updateMp3Volume` | `()` |  | Sets the stream volume to its full value when the music is not a web address |
| `Adventure_updateRadioVolume` | `()` |  | Sets the stream volume to half when the music is a web address (a radio stream) |

## Windows, menus and installation

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_openExternalPM` | `(obj)` | bool. In this client it ignores the object and always returns false (it answers like ispremiumversion()) | Opens external PM window |
| `Adventure_openExternalOptions` | `()` | bool. In this client it always returns false (it answers like ispremiumversion()) | Opens external options window |
| `Adventure_openDefaultViewer` | `(str, int)` | bool. A name that is not an absolute path is looked up among the game's files. Nothing is opened for a file that is not found, for a program or script of the system (.exe, .bat, .sh) or while the game has no window | Opens a file with the program the system has for it (name or path, type) |
| `Adventure_openServerList` | `()` |  | Opens server list (Player Worlds - Login-Server Only): raises the event onOpenServerList in the scripts while the client is connected |
| `Adventure_addMenuLink` | `(str, str, str)` |  | Puts a shortcut that starts the game with the given command line arguments into the start menu (title, arguments, icon file;<br>an empty icon file uses the program's own icon) |
| `Adventure_addDesktopIcon` | `(str, str, str)` |  | Puts an icon that starts the game with the given command line arguments on the desktop (title, arguments, icon file;<br>an empty icon file uses the program's own icon) |
| `Adventure_installGraal` | `(str, bool, bool)` |  | Installs the program in a folder;<br>used by the login-server to update the client (folder, make desktop icon, make start menu shortcut).<br>A folder that is not empty gets a closing / unless it ends with \ or /; an empty folder does nothing |

## Session

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_reconnect` | `()` |  | Asks the client to connect to the server again (re-login) |
| `Adventure_runFailsafeConnector` | `()` |  | Runs StartScript_Connector (failsafe connector script) |
| `Adventure_quit` | `()` |  | Asks the program to quit |
| `Adventure_saveGraalOptions` | `()` |  | Stops the music when its volume is not above 0 and the sound effects when theirs is not above 0, then saves the game settings to disk |

## Registry

Read and write the user's registry settings.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_getRegistryValue` | `(str, str)` | string, empty when it is not there | Reads a value of the user's registry settings (key, name) |
| `Adventure_setRegistryValue` | `(str, str, str)` | bool, whether the value was stored | Writes a value to the user's registry settings (key, name, value) |

## Obsolete functions

Deprecated; the client program does not register them.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_enablePingConnection` | `()` |  | DEPRECATED |
| `Adventure_disablePingConnection` | `()` |  | DEPRECATED |
| `Adventure_startOnlineMode` | `()` |  | DEPRECATED |
| `Adventure_updatePlayerMuted` | `()` |  | DEPRECATED |

## Phone and unregistered functions

Functions from earlier notes that the desktop client program does not register. `Adventure_excludeFileFromBackup` and `Adventure_hasSignerKey` are iOS only.

| Function | Arguments | Returns | Description |
| --- | --- | --- | --- |
| `Adventure_forceDeleteDirectory` | `(str)` |  | Force deletes directory |
| `Adventure_excludeFileFromBackup` | `(str, bool)` |  | Used for backups feature on iOS |
| `Adventure_hasSignerKey` | `()` |  | IOS only |
