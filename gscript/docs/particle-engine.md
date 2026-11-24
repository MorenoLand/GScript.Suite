# Particle Engine Reference

The particle engine in Graal is an extension of the SHOWIMG feature. With the command `showimg`, scripts can display graphics, text, polygons, and animations on the screen. Each SHOWIMG can be used as an emitter for particles.

## Creating a Particle Emitter

### Step 1: Create SHOWIMG

```gs2
with (findimg(200)) {
    x = player.x;
    y = player.y;
}
```

The function `findimg(index)` searches for an existing SHOWIMG with the index, or creates a new one.

## Practical Positioning Rules

Particle effects are drawn from the SHOWIMG or emitter anchor, not from the visual center of the particle image. This matters a lot when `zoom`, `stretchx`, or `stretchy` changes. If a particle image is made larger, the image does not automatically re-center itself; the visible sprite grows away from its anchor. If it is made smaller, the perceived center shifts again.

Because of this, visual size and visual position must be tuned together:

- Use `attachoffset` to place the emitter relative to the owner when the whole effect should follow a player, NPC, projectile, or buff target.
- Use `emissionoffset` to place particle spawns relative to the emitter anchor.
- Keep base `zoom` modest for body-attached auras, then use `addlocalmodifier("range", ..., "zoom", ...)` for pulsing or fading.
- When increasing `zoom` or `stretch`, re-check and adjust `attachoffset` or `emissionoffset`.
- Avoid absolute `player.x` / `player.y` positioning inside reusable buff or target ganis. When that gani is played on another object, the effect can appear offset from the target.

For centered body effects, a common pattern is to attach the image to its owner and compensate the sprite origin:

```gs2
with (findimg(200)) {
    attachtoowner = true;
    attachoffset = {-.5, -.5, 0};
    layer = 0;

    with (emitter) {
        attachposition = false;
        emissionoffset = {1, .5, 0};
        firstinfront = false;
    }
}
```

The exact numbers depend on the source image dimensions and its `zoom`. Treat offsets as part of the art direction, not as constants that work for every sprite.

## Light Sprites With Dark Backgrounds

Some common light sprites, such as `light4.png`, behave like a small white glow on a dark/black source image. If they are drawn with high alpha, the dark part of the image can become visible and the effect looks like a black blob instead of a light.

When using these sprites:

- Prefer additive drawing (`mode = 0`) for glow sprites that should read as light instead of a dark transparent sprite.
- Keep `alpha` at or below `.9`, and never set alpha to `0` or a negative value in the particle definition or alpha modifiers. Use a tiny positive floor such as `.03` to `.05` when fading out.
- Values around `.15` to `.35` are usually a safer starting point for `light4.png`.
- Put soft glow particles on `layer = 1` when they should read over the player without becoming a heavy foreground slash.
- Re-check the largest `zoom` or `stretch` value, because a larger glow also makes the dark source area more visible.
- If the glow is only a subtle aura accent, prefer a lower `alpha` and more particles instead of one large high-alpha particle.

Example for a subtle `light4.png` accent:

```gs2
with (particles[0]) {
  image = "light4.png";
  mode = 0;
  alpha = .22;
  zoom = .3;
  layer = 1;
}

addlocalmodifier("range", .2, .45, "alpha", "replace", .22, .05);
```

### Step 2: Configure Emitter

```gs2
with (findimg(200)) {
    x = player.x;
    y = player.y;
    emitter.delaymin = 0.1;
    emitter.delaymax = 0.2;
    emitter.nrofparticles = 1;
}
```

### Step 3: Configure Particle

```gs2
with (findimg(200)) {
    emitter.particle.lifetime = 3;
    emitter.particle.image = "g4_particle_smoke.png";
    emitter.particle.alpha = 0.8;
    emitter.particle.zoom = 1;
}
```

## Emitter Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `attachposition` | boolean | Particle moves with emitter (true) or flies freely (false) |
| `autorotation` | boolean | Particle heading = movement direction (rotation = angle) |
| `checkbelowterrain` | boolean | Destroy particles below terrain height |
| `clippingbox` | array | Box `{x1,y1,z1,x2,y2,z2}` - particles leaving destroyed |
| `cliptoscreen` | boolean | Auto-resize clipping box to visible area |
| `continueafterdestroy` | boolean | |
| `currentparticlecount` | int (read only) | Current number of particles |
| `delaymin` | float | Minimum delay before next emission (>= 0.05 seconds) |
| `delaymax` | float | Maximum delay before next emission |
| `emissionoffset` | array | Position offset `{x,y,z}` from emitter |
| `emitautomatically` | boolean | Enable/disable automatic emission |
| `emittedparticles` | int (read only) | Total particles emitted |
| `firstinfront` | boolean | First emitted particle displayed in front |
| `isfrozen` | boolean | Stops all particles if true |
| `maxparticles` | int | Maximum particles at once |
| `nrofparticles` | int | Particles emitted per emission |
| `wraptoclippingbox` | boolean | Particles wrap to other side when leaving box |
| `dropemitter` | object | Emitter for particles that drop on ground |
| `dropwateremitter` | object | Emitter for particles that hit water |

## Particle Attributes

### Movement

| Attribute | Type | Description |
|-----------|------|-------------|
| `angle` | float | Horizontal movement angle (x,y plane) |
| `zangle` | float | Vertical movement angle (up/down) |
| `speed` | float | Tiles per second |
| `lifetime` | float | Seconds before particle destroyed |
| `movementvector` | string | Direction as `{x,y,z}` combination |
| `spin` | float | Auto-rotation (radians per second) |

### Appearance

| Attribute | Type | Description |
|-----------|------|-------------|
| `image` | string | Image filename |
| `ani` | string | Gani filename |
| `alpha` | float | Transparency (0 = invisible, 1 = opaque) |
| `zoom` | float | Zoom factor |
| `rotation` | float | Image rotation (radians) |
| `red` | float | Red color value (0-1) |
| `green` | float | Green color value (0-1) |
| `blue` | float | Blue color value (0-1) |
| `stretchx` | float | Horizontal stretch factor |
| `stretchy` | float | Vertical stretch factor |
| `mode` | int | Drawing mode (0=add, 1=transparent, 2=subtract, 3=daynight) |

### Advanced

| Attribute | Type | Description |
|-----------|------|-------------|
| `layer` | int | 4+ for screen coords, <4 for level coords |
| `dimension` | int | Polygon dimension (2 or 3) |
| `polygon` | object | Array of polygon coordinates |
| `text` | string | Text to display |
| `font` | string | Text font name |
| `style` | string | Text style (e.g., "b" for bold) |
| `code` | string | Old format 'font@style@text' |
| `playerlook` | boolean | Use player's head/body/sword/shield/attr |
| `dir` | int | Animation direction |

## Particle Modifiers

Modifiers change particle attributes over time.

### addlocalmodifier()

Modifies each particle individually:

```gs2
emitter.addlocalmodifier(modifierType, rangemin, rangemax, variable, operation, valuemin, valuemax);
```

**Parameters:**

| Parameter | Values |
|-----------|--------|
| modifierType | "once", "impulse", "range" |
| rangemin | Minimum delay/range start |
| rangemax | Maximum delay/range end |
| variable | Attribute to modify (see below) |
| operation | "replace", "add", "multiply" |
| valuemin | Minimum value |
| valuemax | Maximum value |

**Modifier Types:**

| Type | Description |
|------|-------------|
| `once` | Modify one time at start |
| `impulse` | Modify periodically (random interval) |
| `range` | Modify during time range |

**Valid Variables:**

- Standard: `angle`, `zangle`, `speed`, `rotation`, `spin`, `stretchx`, `stretchy`, `red`, `green`, `blue`, `alpha`, `zoom`
- Position: `x`, `y`, `z`, `movex`, `movey`, `movez`

**Operations:**

| Operation | Description |
|-----------|-------------|
| `replace` | Set new value |
| `add` | Add to current value |
| `multiply` | Multiply current value |

### addglobalmodifier()

Same parameters as addlocalmodifier, but affects all particles at once.

### addemitmodifier()

Same parameters, but only affects `emitter.particle` (new emissions).

### addmod()

Add additional modifications to same impulse:

```gs2
with (addlocalmodifier("impulse", 1, 2, "angle", "replace", 0, pi)) {
    addmod("zoom", "add", 0.1, 0.2);
}
```

## Emitter Functions

| Function | Description |
|----------|-------------|
| `emit()` | Manually emit particles |
| `removemodifiers()` | Remove all modifiers |
| `removeparticles()` | Remove all particles |

## Complete Example: Chimney Smoke

```gs2
with (findimg(200)) {
    // Position
    layer = 2;

    // Emitter configuration
    emitter.delaymin = 0.1;
    emitter.delaymax = 0.2;
    emitter.nrofparticles = 1;

    // Particle appearance
    emitter.particle.lifetime = 3;
    emitter.particle.image = "g4_particle_smoke.png";
    emitter.particle.mode = 1; // Alpha transparent
    emitter.particle.alpha = 0.8;
    emitter.particle.zoom = 1;

    // Movement
    emitter.particle.angle = pi / 2; // Up
    emitter.particle.speed = 8;

    // Modifiers for variation
    emitter.addglobalmodifier("impulse", 0.2, 0.2, "spin", "multiply", 0.9, 0.9);
    emitter.addlocalmodifier("once", 0, 0, "angle", "add", -0.2, 0.2);
    emitter.addlocalmodifier("once", 0, 0, "rotation", "replace", 0, 2*pi);
    emitter.addlocalmodifier("range", 1, 3, "alpha", "replace", 0.8, 0);
    emitter.addlocalmodifier("range", 0, 3, "zoom", "add", 0.25, 0.25);
    emitter.addlocalmodifier("range", 0, 0.5, "speed", "replace", 12, 4);
    emitter.addlocalmodifier("range", 0.5, 3, "speed", "replace", 4, 1.5);
    emitter.addlocalmodifier("once", 0, 0, "spin", "replace", 2, 4);
}
```

## Manual Emission

```gs2
with (findimg(200)) {
    emitter.emitautomatically = false;
    emitter.emit(); // Manually emit when needed
}
```

## Position Tracking

```gs2
function onTimeout() {
    // Update emitter position to follow player
    with (findimg(200)) {
        x = player.x;
        y = player.y;
    }
    setTimer(0.05);
}
```

Prefer `attachtoowner = true` for effects that should follow an object. Manual timeout tracking with `player.x` / `player.y` is best kept for effects that are intentionally local to the current player or fixed to a level position.

## Layering

Layer controls whether particles draw below, around, or above characters:

- Use `layer = 0` for ground rings, shadows, low auras, and effects that should sit under the player.
- Use `layer = 1` or `layer = 2` for mid-body effects when the particle should partially blend with the character.
- Use `layer = 3` for slash sparks, impact flashes, overhead flares, and effects that should clearly draw above the target.
- Keep `firstinfront = false` for under-player auras and ground effects.
- Use `firstinfront = true` sparingly for hit sparks, cuts, and front-facing flashes.

If a gani has both image-level `layer` and particle-level `layer`, keep them consistent unless you intentionally want separate background and foreground particle passes.

## Attached Aura Pattern

Use attached emitters for buffs, debuffs, and passive auras. This keeps the effect on the target even when the target moves.

```gs2
SCRIPT
if (created) {
  if (!particleeffectsenabled) return;

  with (findimg(200)) {
    attachtoowner = true;
    attachoffset = {-.5, -.5, 0};
    layer = 0;

    with (emitter) {
      delaymin = .05;
      delaymax = .08;
      nrofparticles = 2;
      emitautomatically = true;
      attachposition = false;
      continueafterdestroy = true;
      firstinfront = false;
      emissionoffset = {1, .5, 0};
      maxparticles = 30;

      particleTypes = 1;
      with (particles[0]) {
        image = "g4_particle_bluex.png";
        zoom = .5;
        alpha = .8;
        mode = 1;
        lifetime = .75;
        speed = 1;
        layer = 0;
      }

      addlocalmodifier("once", 0, 0, "angle", "replace", 0, pi * 2);
      addlocalmodifier("once", 0, 0, "rotation", "replace", 0, pi * 2);
      addlocalmodifier("range", .45, .75, "alpha", "replace", .8, 0);
    }
  }
}
SCRIPTEND
```

## Burst Pattern

For one-shot impacts, disable automatic emission and call `emit()` once. This avoids timers and lingering showimgs.

```gs2
SCRIPT
if (created) {
  if (!particleeffectsenabled) return;

  with (findimg(201)) {
    attachtoowner = true;
    attachoffset = {-.5, -.5, 0};
    layer = 3;

    with (emitter) {
      delaymin = .01;
      delaymax = .01;
      nrofparticles = 20;
      emitautomatically = false;
      attachposition = false;
      firstinfront = true;
      emissionoffset = {1, .5, 0};
      maxparticles = 20;

      particleTypes = 1;
      with (particles[0]) {
        image = "light4.png";
        mode = 0;
        zoom = .4;
        alpha = .28;
        lifetime = .3;
        speed = .4;
        layer = 3;
      }

      addlocalmodifier("once", 0, 0, "angle", "replace", 0, pi * 2);
      addlocalmodifier("range", .1, .3, "alpha", "replace", .28, .05);
      addlocalmodifier("range", 0, .3, "zoom", "replace", .25, .55);
    }

    emitter.emit();
  }
}
SCRIPTEND
```

## Zoom and Offset Checklist

Before finalizing a particle gani:

- Check the base image dimensions and expected anchor.
- Decide whether the effect is under-player, around-body, or above-target before setting layers.
- Set `attachoffset` first with a modest particle `zoom`.
- Add `emissionoffset` to center the spawn area around the owner.
- Only then add `zoom`, `stretchx`, and `stretchy` modifiers.
- Re-check the effect at the largest zoom/stretch value, since that is where offset problems are most visible.
- For reusable buff/debuff ganis, avoid hard-coded `player.x` / `player.y`; use owner attachment instead.

For Zodiac-specific spell animation patterns, see [Zodiac Spell Animation Patterns](../../zodiac_server/spell-animation-patterns.md).
