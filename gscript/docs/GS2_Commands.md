GS2 Commands - Graal Script 2 Commands


// for program execution:
function onEvent() { operation; }	use this for first later of nesting. see the 'scheduleevent()' command/function for creating custom 'onCondition' functions.
function funcname(arguments) { operations; }	defines a function, can be called with funcname(arguments) -- use this format for first layers of nesting
if ( condition) operation;	      	the operation will only be executed wenn flag is true
else operation;	     		executes an operation wenn flag was false
for (init-op; flag; incr-op) operation;	executes <init-op>, then while flag is true <operation;incr-op>
while ( condition) operation;		repeats the operation while flag is true
with ( player/npc) operation; 		executes an operation using player/npc as the current subject (server-side)
switch (condition) { case var: operation; }  evaluates given 'condition' and executes operation when result is equal to specified 'case' result (see "break;" for more info). use 'case default:' for when no other case is true
break;		      		ends a loop and continues with the script that follows to the loop (use this at the end of a "switch" case to prevent the executed script from continuing to the next case)
continue;		    	jumps to the beginning of the loop (next loop round)
return value;			ends the function immediatelly and returns the value specified. (If no value is specified 'null' or 0 is returned)

// simple npc manipulation:
setimg(filename);	      			changes the npc’s image
setimgpart(filename,x,y,width,height);		changes the npc’s image and only displays the rectangle (x,y,width,height) of it
hide();		      			hides the npc
show();		      			shows an hidden npc
dontblock();	      			lets the npc don’t block the player anymore
drawoverplayer();	      			draws the npc over the player
drawunderplayer();			draws the npc under the player
drawaslight();	      			draws the npc above day/night
blockagain();	      			turns off the three previous flags
canbecarried();	      			the npc can now be lifted and carried by the player
cannotbecarried();	      		turns off the previous flag
canbepushed();	      			the npc can now be pushed by the player
cannotbepushed();	      		turns off the previous flag
canbepulled();	      			the npc can now be pulled by the player
cannotbepulled();	      			turns off the previous flag
canwarp();  	     			 enables link warping (dnpc) (server-side)
canwarp2();  	     			 enables link warping for overworld links (dnpc) (server-side)
showcharacter();				displays a player character instead of the npc image
noplayeronwall;  	      			players aren’t counted as a wall in onwall() or onwall2()
destroy();				deletes the npc
sleep(seconds);				pauses the script execution for the specified time

// complex npc operations:
addguildmember(guild,account,nick);  	adds player to a guild (server-side)
removeguildmember(guild,account,nick);	removes a player from a guild (server-side)
removeguild(guild);  			deletes a guild (server-side)
move(dx,dy,time,options);			moves the npc, options: cachtype(0,1,2)+blockcheck(4)+eventwhendone(8)+applydir(16)
say(signindex);	      			displays signs
say2(text);	      			displays text as sign
lay(itemname);	      			lays an item
take(itemname);	      			takes an item if available
take2(index);	      			takes the item with the specified index
message(text);	      			displays a text message over the npc
echo( text );				outputs 'string' to the player's log (on clientside) or in the NPC-Control (on serverside)
timershow();	      			lets the npc’s timeout be shown
setcharani(ganifile,params);			sets the animation for the npc
putnpc(imgname,scriptname,x,y);		creates a npc, scriptname is the name of a textfile containing the npc script
putnpc2(imgname,x,y,{ script });		creates a npc, script is specified within the brackets (server-side only)
callnpc(index,eventflag);			calls the script of another npc (not immediatelly)
callweapon(index,eventflag);			calls the script of a weapon (used together with the variable selectedweapon)
carryobject(carryobjectname);		the character carries an object 
throwcarry();				throws the carried object
seteffect(red,green,blue,alpha);		sets the day/night effect (default 0,0,0,0)
seteffectmode(mode);			changes mode of setcoloreffect of npc (0 - lights color +, 1 - transparency alpha blending, 2 - holes color -)
setcoloreffect(red,green,blue,alpha);		sets the color / alpha blending effect of the npc (default 1,1,1,1)
setzoomeffect(zoomfactor);			sets the zoom factor (default 1)
showani(index,x,y,direction,animation,params);	shows the animation at the given position
showani2(index,x,y,z,direction,animation,params);  shows the animation at the given position
showpoly(index,{x1,y1,x2,y2,...});		draws a polygon with given verticies, 4 params will draw a line
showpoly2(index,{x1,y1,z1,x2,y2,z2,...});	draws a polygon with given verticies, 6 params will draw a line
showtext(index,x,y,font,style,text);		shows text at the given position with font and style
showtext2(index,x,y,z,font,style,text);		shows text at the given position with font and style
showimg(index,filename,x,y);			shows an image at the given position
showimg2(index,image,x,y,z)			shows an image at the given position
hideimg(index);				removes the image/text/polygon/et cetera with the specified index
hideimgs(indexstart,indexend);		removes the given images/texts/polygons/et cetera with the specified indexes as well as all indexes in between
changeimgpart(index,x,y,width,height);	changes the visible part of the showimg
changeimgvis(index,drawingheight);	      	changes the drawing height of the showimg (0,1,2,3,4)
changeimgcolors(index,red,green,blue,alpha);	sets color / alpha blending for the showimg (default 1,1,1,1)
changeimgzoom(index,zoomfactor);		sets zoom factor for the the showimg (default 1)
changeimgmode(index,mode);		changes color mode for showimg (see modes in seteffectmode)
sendtorc(message);  			sends a message to rc (server-side)
sendtonc(message);  			sends a message to nc (server-side)
sendpm(message);   			sends a pm to the current player (server-side)
sendrpgmessage(message);   		sends a rpg message to the current player (server-side)
setshape(type,width,height);			sets the shape of the npc: type=1 means rectangle (width,height in pixels)
setshape2(width,height,{tiletypes..});		sets the shape of the npc to a rectangle of tiles
shoot(x,y,z,angle,zangle,power,gani,ganiparams);  shoots a projectile
setshootparams(params);			sets params sent to called scripts with shoot
shootarrow(direction);			shoots an arrow
shootfireball(direction);			shoots a firewall
shootfireblast(direction);			shoots a fireblast
shootnuke(direction);			shoots an nukeshot
shootball();				shoots a ball directly to the player
spyfire(length,power);			shoots a horse fire with length and power
join(classname);				adds script from classfile classname
hitplayer(index,halfhearts,fromx,fromy);	hurts a player
hitnpc(index,halfhearts,fromx,fromy);		hurts an npc (changes hearts, hurtdx, hurtdy)
takehorse(index);				takes the horse with the specified index (only works in combination with ‘showcharacter’ )
warpto(level,x,y);		     		warps database npc to level at x,y
wraptext(length,delims,text);			divides test into pieces of length ‘length’ with additional delimeters (accessed through tokens)
wraptext2(width,zoom,delims,text);		divides test into pieces of length in pixels
setshape(type,width,height);			sets the shape of the npc: type=1 means rectangle (width,height in pixels)
setshape2(width,height,{tiletypes..});		sets the shape of the npc to a rectangle of tiles

// player manipulation:
attachplayertoobj(type,id);	attachs the player to an npc (type=0)
detachplayer();		detachs the player from the npc
serverwarp(server);   	warps the player to another server
setlevel(filename);		warps the player (URLs not supported) (server-side only)
setlevel2(filename,x,y);	warps the player to the specified level and position (server-side only)
seturllevel(URL);		warps the player to an URL (without the leading http://!)
setbody(filename);		sets the body image for the player
sethead(filename);		sets the head image for the player
setsword(imgname,power);	changes the players sword (-20 £ power £ 20)
setshield(imgname,power);	changes the players shield (0 £ power £ 10)
setani(ganifile);		sets the animation for the player
replaceani(ani,newani);	replaces a default animation
setplayerdir(direction);	sets the player looking direction 
setgender(gender);	sets the gender of the player (male/female) 
takeplayercarry();		removes the object carried by the player
takeplayerhorse();	removes the player’s horse
disableweapons();		disables the player’s sword+bombs+darts
enableweapons();		enables the player weapons
freezeplayer(seconds);	the player can’t move for the given time
freezeplayer2();	                freezes player indefinitely
hideplayer(seconds);	hides the player for the specified time
hidesword(seconds);	hides the player’s sword for the specified time
hurt(halfhearts);		hurts the player
disabledefmovement();	disables the normal player movement
enabledefmovement();	enables it again
disablepause();	                disables the normal player pause
enablepause();	                enables it again
disablemap(); 		disables the normal player map
enablemap();		enables it again

// level/game manipulation:
triggeraction(x,y,actionname,params);		triggers an ‘function onAction<action>()...'on the objects on (x,y)
scheduleevent(seconds,eventname,params,...);	an alternate method of using 'setTimer()' (formerly 'timeout'), this will call the function 'onEventname()' when the timer (in seconds) runs out (the function must be defined somehow in order to work properly)
hitobjects(power,x,y);		hurts all players/npcs/baddies on that position
updateboard(x,y,width,height);	makes level board modifies visible
updateboard2(x,y,width,height);	saves level board modifications if serveroption savelevels=true (serverside)
updateterrain();			makes level terrain modifications visible
setz(x,y,width,height,a,b,c,d);		sets z of x,y with a,b,c,d as corner heights (use updateterrain to save)
putobject(objectname,x,y);		puts an object onto the board
putbomb(power,x,y);		puts a bomb on the board
putexplosion(radius,x,y);		puts an explosion on the board
putexplosion2(power,radius,x,y);	puts an explosion on the board (power=1 -> normal, 3 -> jolt bomb)
putleaps(leaptype,x,y);		procduces an object ‘explosion’ (0-bush,1-swamp,2-stone,3-sign,4-ball,5-water)
puthorse(imgname,x,y);		puts a horse (or boat) on the board
setletters(filename);		signs will be displayed using the specified image instead of letters.png
setmap(imgname,levelnamesfile,x,y);	changes the map, the player will be placed on (x,y)
setminimap(imgname,levelnamesfile,x,y);  changes the minimap, the player will be placed on (x,y)
showstats(bitflag);			shows/hides parts of the stats bar (1-ASD,2-icons,4-rupees,8-bombs,16-arrows,32-hearts,64-ap,128-mp,256-minimap,512-inv,1024-player)
noplayerkilling();			disables hurting with sword/npc weapons
removebomb(index);		removes the bomb with the specified index
removearrow(index);		removes the arrow with the specified index
removeitem(index);		removes the item with the specified index
removeexplo(index);		removes the explosion with the specified index
removehorse(index);		removes the horse with the specified index
explodebomb(index);		explodes the bomb with the specified index
reflectarrow(index);		reflects the arrow with the specified index (like a mirror shield)
addtiledef(image,levelstart,type);	specifys the tiles images for all levels that start with 'levelstart' (0-standard type,1-new order)
addtiledef2(image,levelstart,x,y);	replaces parts of the tiles image
disableselectweapons();		disables the weapon select screen (Q-Menu)
enableselectweapons();		enables it again
enablefeatures(bitflag);	enables/disables game features 
setcursor(cursornumber);	changes the mouse icon to the corresponding windows set (list below)
setcursor2(filename);	changes the map scrolling icon in the offline level editor

// baddy manipulation:
putcomp(baddyname,x,y);			puts a new baddy on the board
putnewcomp(baddyname,x,y,imgname,power);	puts a baddy on the board (with the specified image and power)
hitcompu(index,decrpower,fromx,fromy);	hurts a baddy
removecompus();				removes all baddies

// file operations:
play(filename);			plays a sound/music file or whatever can be played with ‘Windows Media Player’
play2(filename,x,y,volume);		plays a sound/music at x,y with the specified volume (1=default volume)
playlooped(filename);		plays a sound file (*.wav) looped
stopsound(filename);		stops playing a sound file (*.wav)
stopmidi();			stops playing the currently running midi file
setmusicvolume(left,right);		changes the volume for music (0..1)
openurl(URL);			opens the given URL in the default web browser (without the leading http://!)
openurl2(URL,width,height);		opens the given URL in a webbrower window of the specified size (url without http://!)
showfile(filename);		opens the file with the program associated with the file extension
saveinfo(string,string);		saves info as info (server-side)
savelog(string);			saves string to log (server-side)
savelog2(string,string);		saves string to logfile string (server-side)

Stats values (for showstats)
1 	 ASD
2 	 icons
4 	 rupees
8 	 bombs
16 	 arrows
32 	hearts
64 	 ap
128 	 mp
256 	 minimap
512 	 inv
1024 	 player
allstats 	 allstats

Cursor Numbers  (for setcursor)
1	Hidden
2	Normal
3	Cross
4	Text
5	Hidden?
6	Resize Lower Left to Upper Right
7	Resize Up Down
8	Resize Upper Left to Lower Right
9	Resize Left Right
10	Up arrow
11	Hourglass
12	File
13	Not allowed
14	Break adjust Left Right
15	Break adjust Up Down
16	Multiple files
17	SQL Hourglass
18	Not allowed
19	Mouse + Hourglass
20	Mouse + ?
21	Pointing Hand
22	Four directional arrow

Game features (for enablefeatures)
1 	 P key
4 	 Q key
8 	 R key
0x10 	 S+A combo
0x20 	 S+D combo
0x40 	 TAB key
0x80 	 chat text
0x100 	 hearts overhead
0x200 	 display of nicknames
0x400 	 toall/PM bubbles
0x800 	 right-click profiles
0x1000 	 emoticons
0x2000 	 Alt+5 snapshots
0x4000 	 Alt+8/9 zooming
0x8000 	 logframe
allfeatures	 allfeatures

Special Symbols
!	not
&&	and
||	or
==	is equal to
>             greater than
<             less than
>=           greater than or equal to
<=           less than or equal to
+	addition
-	substraction
*	multiplication
/	division
%	mod; a%b = a - int(a/b)*b;
^	power; a^0.5 = squareroot(a)
|	bitwise or
xor	bitwise xor
<<	bitwise shift left
>>	bitwise shift right
&	bitwise and
{ }	array constructor
[ ]	array refrence
new	object constructor
::	class scope operator
? a:b	tertiary operator (condition?true-case:false-case)
in	tests if an array/range contains a variable (e.g. 2 in {1,2,3}; x,y in |0,64|)
=	assigment
a += b	a = a+b
a -= b	a = a-b
a *= b	a = a*b
a++	a = a+1
a--	a = a-1
NL	creates a line break in a string ('new line')
SPC	creates a space in a string ('space')
TAB	creates a tab in a string ('tab')
@	concatenation (fancy word for 'combine') -- used for incorporating a variable or value within a string

Built-in Flags/Events (function on...() {)	true when:
actiondoublemouse   		the player double clicks the npc
actionleftmouse	     		the player left clicks the npc
actionmiddlemouse  		the player middle clicks the npc
actionrightmouse     		the player right clicks the npc
actionprojectile	    		the player has been hit with a projectile (client-side) or a projectile has landed (server-side)
actionsprojectile	    		a serverside projectile has landed  (server-side)
actionprojectile2	    		a projectile has landed (client-side)  (#p(0),#p(1) are x,y; #p(2),#p(3) are params)
actionpushed             		the player pushes the npc
actionpulled              		the player pulls the npc
canspin	                    		the player has spin power (for sword)
carrying	      	    		the player carries something
carriesblackstone	    		the player carries a blackstone
carriesbush	    		the player carries a bush
carriessign	    		the player carries a sign
carriesstone	    		the player carries a stone
carriesvase	     		the player carries a vase
compsdead	     		there is no living baddy
compusdied	     		all baddies died
exploded		     		the npc was exploded by a bomb
firedonhorse	     		this npc weapon is fired while riding on horse
followsplayer	     		the npc currently follows the player
hasweapon( name )		the player has the weapon specified with ‘name’
isfocused			setfocus has been used (not focused on player)
isleader				the player entered the level first (of all players in the same room)
isonmap		      		the player is on an outside level
issparringzone	      		the player is in a sparring level
isweapon			this npc is a weapon
keydown( key )			the specified key is pressed (0..10: up,left,down,right,S,A,D,M,tab,Q,P)
keydown2( keycode,ignorecase)	checks if a key has been pressed (ignorecase must be false to check for shift,ctrl,alt)
keypressed 	      		a key has been pressed (#p(0) is keycode,#p(1) is character) (event)
leftmousebutton	     		the left mouse button is pressed (flag)
lighteffectsenabled		the player can see light effects
middlemousebutton  		the middle mouse button is pressed (flag)
mousedown 	     		a mouse button has been pressed (event) (#p(0) also carries the the strings left,right,double for those corresponding events)
mouseup		     		a mouse button has been released (event)
mousewheel	     		the mousewheel has been used (event)
nopkzone	     		the player is in a level where you can’t hurt other players
onmapx( level )	     		x-position of the level on the current map
onmapy( level )	     		 y-position of the level on the current map
onwall( x, y )	     		the specified field is blocked
onwall2( x, y,width,height )		the specified field is blocked (server-side)
onwater( x, y )	      		the specified field is water
playeronline	      		the game is in online mode
peltwithblackstone     		the npc was pelt with a blackstone
peltwithbush	     		the npc was pelt with a bush
peltwithnpc	     		the npc was pelt with another npc
peltwithsign	     		the npc was pelt with a sign
peltwithstone	      		the npc was pelt with a stone
peltwithvase	      		the npc was pelt with a vase
playerchats	      		the player says something
playerdies	      		the player died
playerendsreading		the player finished reading
playerenters	      		the layer enters the room
playerhurt	      		the player has been hurt 
playerisfemale	      		the player is female
playerismale	      		the player is male (specified in headsconfig.txt)
playerlaysitem	      		somebody layed an item
playermap	      		the player is reading the map
playeronhorse	      		the player rides on a horse (or boat)
playerpause	      		the player is paused
playerreading	      		the player is reading a sign
playerswimming	      		the player is swimming
playertouchsme	      		the layer touchs the npc
playertouchsother	      		the player touchs another npc
playerattached	      		the player is attached to this npc
rightmousebutton	      		the right mouse button is down (flag)
shotbybaddy	      		the npc was shot by a computer opponent
shotbyplayer	      		the npc was shot by the player
startswith( partstr, str )		str starts with partstr
strcontains( str, partstr )		str contains partstr
strequals( str1, str2 )		str1=str2 (both strings can contain message codes)
timeout		      		the npc’s timeout counter runs to 0
visible		      		the npc is visible
washit		      		the npc was slayed with a sword or axe
waspelt		     		the npc was pelt
wasshot		     		the npc was shot with arrows
wasthrown	     		the npc was carried and then thrown
weaponfired	     		this npc is used as weapon, ‘D’ (or joybutton1) is pressed
weaponsenabled	     		the player weapons are enabled

Variable Prefixes
client.flag	flags that can be changed on server-side and client-side (like a normal flag in the classic engine)
clientr.flag	flags that can only be changed on server-side but can be read on client-side
server.flag	flags that only exists on server-side and can be accessed by all npcs
serverr.flag	flags that can only be changed on server-side and is server wide, but can also be read by all clients, so it can be used to storing the state of global activities that need client-side actions like displaying weather; like server. flags they can also be changed with remotecontrol.exe by administrators that have the right to change server. flags
this.flag		flags that only exist on server-side and belong to the npc, and are stored when the npc is a database npc
thiso.flag	refer to the this. flags of the executing npc when you use the with () command: with (getnpc(npc2)) setstring thiso.temp,this.temp; will copy 'this.temp' from npc2 to the current npc  
temp.flag	flags that are created only during the duration current function 'onEvent' and cannot be accessed or referenced outside of the function.  these are deleted as soon as the function ends
local.flag	flags that are kept on the current client and not sent to the server, so reducing lag
flagwithoutleading    flag that is saved in the players account; these flags can only be accessed on server-side; on client-side you can also use flags wihtout a leading but they are not saved and not sent to the npcserver

Built-in Variables / Functions
x			the npc’s horizontal position (player.x for player)
y			the npc’s vertical position (top=0) (player.y for player)
rupees		      	the npc’s rupees count (player.rupees for player)
bombs		      	the npc’s bombs count (player.bombs for player)
darts		      	the npc’s darts count (player.darts for player)
hearts		      	the npc’s hearts count (player.hearts for player)
glovepower	      	the npc’s glove power (1-glove1,2-glove2) (player.glovepower for player)
swordpower	      	the npc’s sword power (1-normal sword,2-axe,3-lizardsword,4-golden sword) (player.swordpower for player)
shieldpower      	      	the npc’s shield power (1-normal sword,2-mirror shield,3-lizard shield) (player.shieldpower for player)
dir		      	the direction of the character (player.dir for player)
sprite		      	the sprite of the character (player.sprite for player)
ap		      	the alignment points of the character (player.ap for player)
timeout			the npc's current timeout counter (in seconds)
hurtdx		      	will be set when the player uses the sword/npc weapon on the npc
hurtdy		      	(x/y difference, >=-1, <=1)
save[0],..,save[9]	      	built-in variables that work in online mode (integer values >=0, <=220)

npcscount		      	the npcs count
npcs[index].id		      	the server id of the npc
npcs[index].x		      	an npc’s horizontal position
npcs[index].y		      	an npc’s vertical position
npcs[index].z		      	an npc’s z  position
npcs[index].width		      	the width of the npc (in fields)
npcs[index].height		      	the height of the npc (in fields)
npcs[index].timeout	      	the timeout counter of the npc
npcs[index].rupees		      	the rupees count of the npc
npcs[index].bombs		      	the bombs count of the npc
npcs[index].darts		      	the darts count of the npc
npcs[index].hearts		      	the hearts count of the npc
npcs[index].glovepower	      	the glove power of the npc
npcs[index].swordpower	      	the sword power of the npc
npcs[index].shieldpower	      	the shield power of the npc
npcs[index].dir		      	the direction of the npc (if it’s a ‘showcharacter’)
npcs[index].sprite		      	the sprite of the npc (if it’s a ‘showcharacter’)
npcs[index].anistep	      	the anistep of the npc (if it’s a ‘showcharacter’)
npcs[index].ap		      	the alignment of the npc (if it’s a ‘showcharacter’)
npcs[index].hurtdx		      	will be set when the player hurts the npc (or
npcs[index].hurtdy		        	(hitplayer/hitpnc is called) -> push away difference
npcs[index].save[0],..,save[9]		built-in variables that work in online mode (integer values >=0, <=220)

allplayers[index]		      	gets player from all players
players[index]		      	gets player from level
players[index].x		      	a player’s horizontal position
players[index].y		      	a player’s vertical position
players[index].z		      	a player’s z  position
players[index].rupees	      	a player’s rupees count
players[index].bombs	      	a player’s bombs count
players[index].darts	      	a player’s darts count
players[index].mp		      	a player’s magic points (0..100)
players[index].ap		      	a player’s alignment points (0..100)
players[index].hearts	      	a player’s hearts count
players[index].fullhearts	      	a player’s max hearts count
players[index].dir		      	a player’s direction (0-up,1-left,2-down,3-right)
players[index].glovepower	      	a player’s glove power (2-glove1,3-glove2)
players[index].swordpower	      	a player’s sword power (1-normal sword,2-axe,3-lizardsword,4-golden sword)
players[index].shieldpower	      	a player’s sield power (1-normal sword,2-mirror shield,3-lizard shield)
players[index].headset	      	a player’s head sprites set (”head”+playerheadset+”.gif”)
players[index].sprite	      	a player’s sprites set (0..40)
players[index].anistep	      	the anistep of the player)
players[index].id		      	a player’s id (=-1 for npc characters)
players[index].saysnumber	      	the (index+1)th  player says that number 
players[index].id		      	a player’s id (=-1 for npc characters)
players[index].attachid	      	the player is attached to the npc with that id (<=0-> not attached)
players[index].attachtype	      	the type of object the player is attached to
players[index].logintime	      	when the player logged in (in timevar)
players[index].lastdead	      	when the player last died (in timevar)
playerhurtdpower	      		how much power the player lost when he was hurt last
playerhurtdx	      		the horizontal hurting movement of the player
playerhurtdy	      		the vertical hurting movement of the player
 (playerx,playery,... = players[0].x,players[0].y,... = current players properties)

compuscount		      the baddy count
compus[index].x		      a baddy’s horizontal position
compus[index].y		      a baddy’s vertical position
compus[index].type	      a baddy’s type (0..9, see the baddy names list)
compus[index].dir		      a baddy’s body direction (0..3)
compus[index].headdir	      a baddy’s head direction (0..3)
compus[index].power	      a baddy’s power
compus[index].mode	      a baddy’s mode

bombscount		      the bombs count
bombs[index].x		      a bomb’s horizontal position
bombs[index].y		      a bomb’s vertical position
bombs[index].power	      the bomb’s power (1,2,3)
bombs[index].time		      the time left till explosion (3 .. 0)

arrowscount	      the arrows count (arrows + balls)
arrows[index].x	      an arrow’s horizontal position
arrows[index].y	      an arrow’s vertical position
arrows[index].dx	      the horizontal speed per tick (0.05secs)
arrows[index].dy	      the vertical speed per tick (0.05secs)
arrows[index].dir	      the flying direction (0,1,2,3)
arrows[index].type      the shottype (-1 -> ball, 0..3 -> arrow with power 1..4)
arrows[index].from      the shooter (0 -> baddy, 1 -> current player)

itemscount	      the items count
items[index].x	      an item’s horizontal position
items[index].y	      an item’s vertical position
items[index].type	      the item type (0..24)
items[index].time	      the time left till the item disappears (8.2 .. 0)

exploscount		      the explosions count (putexplosion produces 9 explosions of size 2x2!)
explos[index].x		      an explosion’s horizontal position
explos[index].y		      an explosion’s vertical position
explos[index].power	      the power of the bomb which produced this explosion
explos[index].time		      the time left till the explosion disappears
explos[index].dir		      the direction from the bomb which produced the explosion

horsescount		      the horses count
horses[index].x		      an horses’s horizontal position
horses[index].y		      an horses’s vertical position
horses[index].dir		      the direction of the horse
horses[index].bushes	      bushes eaten by the horse
horses[index].bombs	      bombs count in the horse’s mouth
horses[index].bombpower	      the power of the bombs on the horse’s mouth
horses[index].type		      the horse type (0 -> riding horse, 1 - boat)

signscount	      the signs count
signs[index].x	      a sign’s horizontal position
signs[index].y	      a sign’s vertical position

abs( var )	                the absolute value
aindexof( value,array )   	position of where valuefirst  appears in array
actionplayer 	      	gives index of player who triggered  an action
arctan( var )	      	the arcus tangens of var; (some maths: a = arctan( sin(a) / cos(a) ))
arraylen( var )	      	the size of an array
ascii( char )	      	the ascii code of a character
board[index]	      	the level board (index = 0..64*64-1)
cos( a )		      	the cosinus of a; a is an angle in the radiant system (0...3.14)
downloadpos                 	the download position
getangle( dx,dy )	      	the angle of vector (dx,dy) to the x coordinate (0...2*3.14)
getdir( dx,dy )	      	gets the direction needed to look at relative position
getz( x,y )	      	gets the z of the tile at that position
getplayer( account )	      gets the allplayers index of account
getnearestplayer( x,y )	      gets the index of the nearest player
getnearestplayers( x,y,flag )	      gets the indecies of the nearest players with flag „flag“
getareanpcs( x,y,width,height )    gets the indecies of all npcs within the given parameters
getnpc( name )	      	gets the index of the dbnpc with name name
graalversion	      	current Graal version
gravity		      	gravity variable for projectiles (default set to 2)
imgwidth( imgname )  	gets width of loaded image
imgheight( imgname )  	gets height of loaded image
indexof( partstr, str )	position of where partstr appears in str (-1 -> not in str)
int( var )		      	the integer value of a variable (truncates the floating point part)
keycode( char ) 	      	gets the keycode for the character
levelorgx	     	level origin (x), can be different to 0,0 if the player is attached to an npc
levelorgy	     	level origin (y)
lindexof( str, list )	     	position of where the string appears in the string list
log( base,x )	    	the logarithm of x with base base
max( a,b )	      	gets maximum of a and b
min( a,b )	     	gets minimum of a and b
mousebuttons	      	sum of values for mouse buttons pressed (1 = left, 2 = middle, 4 = right)
mousescreenx 	      	x position of mouse in the game screen
mousescreeny 	      	y position of mouse in the game screen
mousewheeldelta	      	movement of mouse wheel in past .05 seconds
mousex 		      	x position of mouse on the level
mousey 		      	y position of mouse on the level
musicpos		position in current music playing (won’t work on midis)
musiclen	       	length in current music playing (won’t work on midis)
playerfreezetime 	      	time for which player is frozen (in seconds; -1 when not frozen)
random( a, b )	      	a random floating point value, a<= value < b
sarraylen( list )	  	the size of a string list
setTimer( seconds ) 	sets npc’s timeout counter (in seconds)
screenheight	      	screen height
screenwidth	      	screen width (for the current player)
screenx( x,y )	      	converts level x,y to screen x
screeny( x,y )	      	converts level x,y to screen y
selectedweapon	      	the index of the selected weapon of the player
sin( a )		      	the sinus of a; a is an angle in the radiant system (0...3.14)
strlen( str )	      	the length of the string
strtofloat( str )	      	the value of ‘str’ as number
testbomb( x, y )	      	the index of the bomb on position (x,y)
testcompu( x, y )	      	the index of the baddy on position (x,y)
testexplo( x, y )	      	the index of the explosion on position (x,y)
testhorse( x, y )	      	the index of the horse on position (x,y)
testitem( x, y )	      	the index of the item on position (x,y)
testnpc( x, y )	      	the index of the npc on position (x,y)
testplayer( x, y )	      	the index of the player on position (x,y)
testsign( x, y )	      	the index of the sign on position (x,y)
tiles[ x, y ]	      	the tile index at x,y, writable
tiletype( x, y )	      	returns the neworder tiletype used for setshape2 on x,y
timevar		      	a server-wide time variable which is increased by 1 all 5 seconds
textheight( zoom,font,style ) 	gets the height of the text with the specified zoom font and style 
textwidth( zoom,font,style,text )  gets the width of the text with the specified zoom font and style
tokenscount	      	count of tokens produced with tokenize
waterheight	      	sets waterheight of terrain levels
vecx( dir )	      	vertical movement vector (0,-1,0,1)
vecy( dir )	      	horizontal movement vector (-1,0,1,0)
weaponscount	      	count of weapons/items the player has
worldx( x,y )	      	converts screen x,y to level x
worldy( x,y )	      	converts screen x,y to level y

Key Numbers
8	back
9	tab  (does not work with keypressed)
13	return
16	shift (does not work with keypressed)
17	control (does not work with keypressed)
18	alt (does not work with keypressed)
33	page up (does not work with keypressed)
34	page down (does not work with keypressed)
35	end (does not work with keypressed)
36	home (does not work with keypressed)
42	print key (does not work with keypressed)
45	insert (does not work with keypressed)
46	delete (does not work with keypressed)
91	left windows key (does not work with keypressed)
92	right windows key (does not work with keypressed)
93	mouse popup key (does not work with keypressed)
112-123	F1-F12 (does not work with keypressed)
144	numlock (does not work with keypressed)
160	left shift (does not work with keypressed)
161	right shift (does not work with keypressed)
162	left control (does not work with keypressed)
163	right control (does not work with keypressed)
164	left alt/menu (does not work with keypressed)
165	right alt/menu (does not work with keypressed)

Tiletype / tile index (use with setshape)
nonblock		0
hurt underground	2
chair			3
bed upper		4
bed lower		5
swamp			6
lava swamp		7
near water		8
water			11
lava			12
throw-through		20
jump stone		21
blocking		22

Itemname / item index 
greenrupee	0
bluerupee	1
redrupee	2
bombs	3
darts	4
heart	5
glove1	6
bow	7
bomb	8
shield	9
sword	10
fullheart	11
superbomb	12
battleaxe	13
goldensword	14
mirrorshield	15
glove2	16
lizardshield	17
lizardsword	18
goldrupee	19
fireball	20
fireblast	21
nukeshot	22
joltbomb	23
spinattack	24

Carry object names
bush
sign
vase
stone
blackstone
bomb
hotbomb
superbomb
joltbomb
hotjoltbomb
none

Colornames
white
yellow
orange
pink
red
darkred
lightgreen
green
darkgreen
lightblue
blue
darkblue
brown
cynober
purple
darkpurple
lightgray
gray
black
transparent

Directions ( 'dir' for NPCs, 'player.dir' for Players )
up	(0)
left	(1)
down	(2)
right	(3)

Baddy names
graysoldier
bluesoldier
redsoldier
shootingsoldier
swampsoldier
frog
octopus		<- spider, for compatibility
goldenwarrior
lizardon
dragon

Baddy modes
0	walking
1	looking
2	hunting
3	hurted
4	bumped
5	dying
6	shooting (swampsoldier)
7	jumping (frog)
8	shooting (spider)
9	dead

Player sprites ( 'sprite = ... ;' for NPCs)
0	no movement, or not a default animation
1-8	walking
9-13	sword slaying
14-18	pushing
19-22	pulling
23	lifting
24	no movement, carrying something
25-32	walking, carrying something
33	shooting
34-36	riding
37	sitting
38	sleeping
39	hurted (can only be set on ‘showcharacter’-npcs)
40	dead (can only be set on ‘showcharacter’-npcs)

Translations of former message codes (variables/arrays/functions/etc)
player.acount				the account name of the player
str NL str				line break ( NL is an abbreviation for 'newline' ) 
colors[index]			  	{ the skin color, the coat color, the sleeves color, the shoes color, the belt color }
colors[0]				the skin color
colors[1]				the coat color
colors[2]				the sleeves color
colors[3]				the shoes color
colors[4]				the belt color
player.chat				the current chat text of the player (for NPCs)
str.substring(start,len)		extracts a substring out of ‘string’ (length=-1 -> till the end)
image				the image filename of the npc
player.guild				the guild name of the player
var[index]			  	gets a string of a string list
#i(imgname), #i(imgname,x,y,w,h)	displays an image or a part of an image when used in a sign
#K(keyindex)				the name of the specified key
#k(keyindex)				the description of the specified key (in local language / key assignments)
level				the current level filename of the NPC (use 'player.level' for the player's level filename)
player.ani				the player's current animation
player.nick				the nick name of the player (use 'nick' for NPCs)
attr[index]				the gani attribute (index = 1 (hat), 2, ...)
params[index]				action parameter of the specified index
str @ var				the value of the string variable ‘var’
array = var.tokenize();		token of the specified index, produced with the tokenize() function
var.trim()				trims the string (removes any spaces at the beginning and end)
var				the value of ‘var’ as a string (used for incorporating a variable alongside a string
#W, #W(index)				the filename of the weapon icon
#w,#w(index)				the name of the current npc weapon of the player
sword				the sword image filename of the player
shield 				the shield image filename of the player
head 				the head image filename of the player
#5, #5(index)				the image filename of the player’s horse
#6, #6(index)				the image filename of the npc that is carried by the player
#8, #8(index)				the body image filename of the player

