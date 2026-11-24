Documentation of Emitters on Graal v4+

Document written by TGC with the script help of various friends.


First off, Particle Emitters, or 'emitters' for short, are an extra segment of GraalScript2 added to v4. An emitter is an object within the TShowImg, or an image shown by a showimg() function. To understand emitters, one must understand first off what parts of an image we would need to alter, as well as some of the functions and commands one should know beforehand. Please note that one should not try to create an emitter without at least having some previous knowledge of basic GraalScript2.

Primarily, the function 'findimg()' is used very, very often when creating emitters. This function works just like 'findplayer()' or 'findnpc()', as in, it returns the reference to an object. 'Findimg()' is used clientside with the emitters. Here is an example of code using 'findimg()':
[CODE]
  //#CLIENTSIDE
  function onCreated() {
    showimg(1,"block.png",player.x,player.y);
    with (findimg(1)) {
      image = "light2.png";
      x = player.x - 3;
      y = player.y - 3;
      alpha = .9;
    }
  }
[/CODE]
This script would show 'block.png' at the player's location, then change the image to 'light2.png', move the image three tiles up and left, and change the alpha to .9. 'Findimg()' is very, very handy.

Secondly, an image not shown has an x and y value identical to the player's. For example:
[CODE]
  //#CLIENTSIDE
  function onCreated() {
    player.chat = findimg(1).x;
  }
[/CODE]
Would set the player's chat to the x value of the current player, as image 1 was not defined in that script. Also, for an undefined image, the 'image' attribute is "", or an empty string.

And third, you do not need to define the image with 'showimg()' in order to cast an emitter on it. Most emitters I make are targeting images that have not been defined with script, unless, for instance, I'm making a cauldron NPC, which then would need the cauldron image to show.

Now, I will teach the emitters from start to finish, minus a small handful of details which I, myself, still don't understand. 

A particle emitter is an object. Just like 'player.' or 'this.', it is an object. It's parent is the TShowImg, which is the showimg object. First off, you do not need to define an image to cast an emitter on it. in fact, I did not and I made some pretty nice and simple emitters. Now, the 'emitter.' object is how we access and create an emitter. First off, the basics:

[PHP]
//#CLIENTSIDE
function onCreated() {
  with (findimg(#)) { // Replace # with the index of the image you want to modify. For some reason, emitters are still shown only to the current player, even when the index is less than 200. Wierd.
    layer = 1; // This will make the emitter draw under the player
    x = player.x;
    y = player.y; // These will show the emitter at the player's coords.
[/PHP]

Follow along with what I'm doing? Now, here are the variables we will need to define, after setting the layer, x, and y, and inside the findimg() bracket:

[PHP]
    emitter.attachposition = boolean; // If the image's x and y move, would the entire emitter, every single particle at once, move along with the image? If true, every sprite moves when the image movies. If false, then only the point of origin, where the particles are created, move when the image is moved.
    emitter.delaymin = float; // This is the minimum delay between emissions.
    emitter.delaymax = float; // This is the maximum delay between emissions, both of these are in seconds.
    emitter.emissionoffset = string; // In format of "{float, float, float}", it's the offset from the x, y, and z that an emission will show. It's the delta variables for the location, basically.
    emitter.firstinfront = boolean; // Should the first emitted particle be in front of every other particle?
    emitter.nrofparticles = integer; // The number of particles to be released at the same exact time when the emitter emits. For example, set this to two, and you'll have two particles released every time instead of the default 1.
    emitter.maxparticles = integer; // The maximum number of particles that can exist at one time. If this limit is reached, the script will wait until one of the particles runs out before emitting another one.
[/PHP]

There. Define those as you wish. Now, time to teach how to change the particle attributes, and not the laws that govern just the emitter itself.

[PHP]
    emitter.particle.lifetime = float; // How long, in seconds, the emitter lasts.
    emitter.particle.image = string; // The imagename of the emitter
    emitter.particle.mode = integer; // Either 0, 1, or 2, the same as changeimgmode. 0 = add, 1 = trans, 2 = subtract. Use this for a blacklight effect if you wish.
    emitter.particle.alpha = float; // Between 0 and 1, the alpha colour for transparancy
    emitter.particle.zoom = float; // The zoom effect of the particle
    emitter.particle.red = float;
    emitter.particle.green = float;
    emitter.particle.blue = float; // These three are between 0 and 1, and they're the colours of the individual particles
    emitter.particle.zangle = float; // Between 0 and pi*2, it's the upward angle of the particles. Remember zangle from the shoot() function? Same basic idea.
    emitter.particle.angle = float; // Again, between 0 and pi*2, it's the angle that the particle should flow.
    emitter.particle.speed = float; // I'm not sure if this is measured in Tiles per second or what, but it's the speed. Higher = faster, obviously
    emitter.particle.spin = float; // The number of times each particle rotates while it's being shown. Ex, 1 will make the particle rotate just once before it hides.
    emitter.particle.stretchx = float; // This is how 'stretched' each particle will be, relative to width.
    emitter.particle.stretchy = float; // This is how 'stretched' each particle will be, relative to height.
[/PHP]


Now, emitters have something called 'modifiers' that, well, modify the emitter, basically. This is where my knowledge is slightly vague, as there are three types of modifiers, and I only understand one of them, so I will only teach one of them. The syntax for a modifier is as follows:

[PHP]
    emitter.addLocalModifier(selection_type, range_min, range_max, modified_attrib, process, new_min, new_max);
[/PHP]

Yeah, I know that looks daunting, but you handled the shoot() function, right? So this shouldn't be as hard. Now. 'selection_type' is how the emitter knows what to modify. For example, if you say "once", the emitter will modify the particles only once. However, when you say "range", the emitter will keep modifying the particles while their lifetime is between 'range_min' and 'range_max'. 'modified_attrib' is the name of the particle attribute you want to modify. I've used "x", "y", "alpha", "zoom", "red", "green", "blue", "angle", "speed", "stretchx" and "stretchy". Lastly, 'process' is the mathematical way that the particles will be modified. I always use either "add" or "replace", but I know "multiply" exists as well. If you use "replace", with "range" as the 'selection_type', the the 'modified_attrib' attribute of the particles with the current lifetime between 'range_min' and 'range_max' will fade from 'new_min' to 'new_max'.

For example, if I set the 'lifetime' to 3, and do this modifier:
[CODE]
    emitter.addLocalModifier("range", 0, 3, "alpha", "replace", 1, 0);
[/CODE]
Then the particles will start out with an 'alpha' value of 1, then fade to 0, arriving at 0 just as their lifetime ends. If you use "add" or "multiply" for the 'process', then the attribute you have for 'modified_attrib' will either be added to or multiplied by a random number between 'new_min' and 'new_max'. Just fiddle around with emitters, and you should get the hang of it. There's one last function I'd like to teach first:

[PHP]
    emitter.emit();
[/PHP]

This forces the emitter to, basically, emit. Now, if you want to make an emitter emit only once, and not constantly, you'd set the 'delaymin' and 'delaymax' to 10000 (this is the number Stefan uses), then call an 'emit()' function after you set all the attributes of the emitter. Don't forget to hide the image with 'hideimg()', otherwise the thing will unexpectedly emit 10000 seconds later! (Note, I have yet to actually wait this long, so I have no clue if my last statement was correct or not. It would make sense if it was. z-z)

Now, if you understood all that, you should know as much about emitters as I do. So, go off onto your local GS2 server with your new, shiny VIP account and script up a storm! Note, you can put emitters in a weapon NPC (NPCw) or a level NPC. It doesn't matter, as long as it's clientside. So now, I hope you can use emitters for effects, ranging from weather systems to pick axes, crafting hammers, warp rings, fun effects scripts, and about anything else you can imagine. In my private hangout level, I have emitters to mimic the burning of incence, which looks rather nice.


I hope you learned from this tutorial, and if you need anything, you can message me on AIM at TheOneGC, PM me on Graal anytime between 4:00 and 9:00PM on weekdays, or send me a PM via the Graal Forums. Have fun scripting with emitters!

  -- Iten Eya-Ler� Neseta (TGC)