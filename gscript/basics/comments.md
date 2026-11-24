# Comments

Comments are text in your code that is ignored by the script engine. They are used to explain what your code does or to temporarily disable lines of code.

## Single-Line Comments

Anything after `//` is a comment and is ignored:

```gs2
function onCreated() {
    // This line will not run
    // echo("Hello!");

    // This is a comment explaining the next line
    echo("This will run!"); // You can also put comments here
}
```

## Multi-Line Comments

You can create multi-line comments using `/*` and `*/`:

```gs2
function onCreated() {
    /*
    This is a multi-line comment.
    None of this will run.
    echo("Hello!");
    echo("World!");
    */

    echo("This will run!");
}
```

## Best Practices

### Explain Complex Logic

```gs2
function calculateDamage(base, level, bonus) {
    // Damage formula: base + (level * 2) + bonus
    // This ensures higher level players do more damage
    temp.damage = base + (level * 2) + bonus;
    return temp.damage;
}
```

### Document Function Purpose

```gs2
// Heals the player by the specified amount
// Cannot exceed maximum health
function healPlayer(amount) {
    temp.newHealth = player.hearts + amount;
    if (temp.newHealth > player.maxhearts) {
        temp.newHealth = player.maxhearts;
    }
    player.hearts = temp.newHealth;
}
```

### Temporarily Disable Code

```gs2
function onCreated() {
    // Testing: disable these for now
    // initializePlayer();
    // loadInventory();

    // Only run this for testing
    echo("Debug mode active");
}
```
