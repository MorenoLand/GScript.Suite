# Math

Math in GraalScript is actually much simpler than what you learned in school! You'll mostly be doing basic calculations like addition, subtraction, and maybe some multiplication.

## Basic Math Operations

```gs2
function onCreated() {
    temp.a = 2;
    temp.b = 4;
    temp.result = temp.a + temp.b;
    echo("Result: " @ temp.result);
}
```

**Output:** `Result: 6`

## Math Operators

| Operator | Operation          | Example | Result |
| -------- | ------------------ | ------- | ------ |
| `+`      | Addition           | `5 + 3` | `8`    |
| `-`      | Subtraction        | `5 - 3` | `2`    |
| `*`      | Multiplication     | `5 * 3` | `15`   |
| `/`      | Division           | `6 / 3` | `2`    |
| `^`      | Exponents (Power)  | `2 ^ 3` | `8`    |
| `%`      | Modulo (Remainder) | `5 % 2` | `1`    |

### Examples of Each Operator

```gs2
function onCreated() {
    temp.a = 10;
    temp.b = 3;

    echo("Addition: " @ (temp.a + temp.b));       // 13
    echo("Subtraction: " @ (temp.a - temp.b));    // 7
    echo("Multiplication: " @ (temp.a * temp.b)); // 30
    echo("Division: " @ (temp.a / temp.b));       // 3.33333
    echo("Exponent: " @ (temp.a ^ temp.b));       // 1000
    echo("Modulo: " @ (temp.a % temp.b));         // 1
}
```

### Understanding Modulo (%)

The modulo operator `%` gives you the **remainder** after division:

- `5 % 2 = 1` (because 5 ÷ 2 = 2 remainder 1)
- `8 % 3 = 2` (because 8 ÷ 3 = 2 remainder 2)
- `10 % 5 = 0` (because 10 ÷ 5 = 2 remainder 0)

This is useful for things like checking if a number is even or odd!

```gs2
function onCreated() {
    temp.num = 7;
    if (temp.num % 2 == 0) {
        echo(temp.num @ " is even");
    } else {
        echo(temp.num @ " is odd");
    }
}
```

## Assignment Operators (Shortcuts)

Instead of writing `temp.a = temp.a + 5`, you can use shortcuts:

| Operator | Long Form   | Short Form | Description         |
| -------- | ----------- | ---------- | ------------------- |
| `+=`     | `a = a + b` | `a += b`   | Add and assign      |
| `-=`     | `a = a - b` | `a -= b`   | Subtract and assign |
| `*=`     | `a = a * b` | `a *= b`   | Multiply and assign |
| `/=`     | `a = a / b` | `a /= b`   | Divide and assign   |
| `++`     | `a = a + 1` | `a++`      | Increment by 1      |
| `--`     | `a = a - 1` | `a--`      | Decrement by 1      |

### Example: Using Assignment Operators

```gs2
function onCreated() {
    temp.score = 100;
    echo("Starting score: " @ temp.score);

    temp.score += 50;  // Same as: temp.score = temp.score + 50
    echo("After bonus: " @ temp.score);

    temp.score -= 25;  // Same as: temp.score = temp.score - 25
    echo("After penalty: " @ temp.score);

    temp.score *= 2;   // Same as: temp.score = temp.score * 2
    echo("After doubling: " @ temp.score);
}
```

**Output:**
```
Starting score: 100
After bonus: 150
After penalty: 125
After doubling: 250
```

## Order of Operations

Operations happen in a specific order:

1. **Parentheses** `()`
2. **Exponents** `^`
3. **Multiplication and Division** `*` `/` (left to right)
4. **Addition and Subtraction** `+` `-` (left to right)

### Example: Using Parentheses

```gs2
function onCreated() {
    temp.a = 2;
    temp.b = 3;
    temp.c = 4;

    // Without parentheses: 2 + 3 * 4 = 2 + 12 = 14
    temp.result1 = temp.a + temp.b * temp.c;
    echo("Without parentheses: " @ temp.result1);

    // With parentheses: (2 + 3) * 4 = 5 * 4 = 20
    temp.result2 = (temp.a + temp.b) * temp.c;
    echo("With parentheses: " @ temp.result2);
}
```

**Output:**
```
Without parentheses: 14
With parentheses: 20
```

## Built-in Math Functions

GraalScript provides several built-in math functions:

### Trigonometry

| Function | Description               | Example                       |
| -------- | ------------------------- | ----------------------------- |
| `sin(x)` | Sine (x in radians)       | `sin(1.57)` ≈ 1               |
| `cos(x)` | Cosine (x in radians)     | `cos(0)` = 1                  |
| `tan(x)` | Tangent (x in radians)    | `tan(0.785)` ≈ 1              |
| `arcsin(x)` | Arc sine               | `arcsin(1)` ≈ 1.57            |
| `arccos(x)` | Arc cosine             | `arccos(0)` ≈ 1.57            |
| `arctan(x)` | Arc tangent            | `arctan(1)` ≈ 0.785           |

### Rounding and Absolute Value

| Function | Description                    | Example              |
| -------- | ------------------------------ | -------------------- |
| `abs(x)` | Absolute value (removes minus) | `abs(-10)` = 10      |
| `floor(x)` | Round down to nearest integer | `floor(3.7)` = 3   |
| `ceil(x)` | Round up to nearest integer   | `ceil(3.2)` = 4    |
| `round(x)` | Round to nearest integer     | `round(3.5)` = 4   |
| `int(x)` | Convert to integer (truncates) | `int(3.7)` = 3     |

### Power and Root

| Function | Description          | Example            |
| -------- | -------------------- | ------------------ |
| `sqrt(x)` | Square root         | `sqrt(16)` = 4     |
| `pow(x, y)` | x to the power y | `pow(2, 3)` = 8    |
| `x ^ y` | Exponent operator    | `2 ^ 3` = 8        |

### Min and Max

| Function | Description                    | Example              |
| -------- | ------------------------------ | -------------------- |
| `min(a, b)` | Smaller of two values       | `min(5, 10)` = 5     |
| `max(a, b)` | Larger of two values        | `max(5, 10)` = 10    |

### Random Numbers

| Function | Description                          | Example                    |
| -------- | ------------------------------------ | -------------------------- |
| `random(min, max)` | Random float between min and max | `random(1, 10)` = 4.723... |
| `randomstring(length)` | Random alphanumeric string | `randomstring(8)` = "x7Kp2mQw" |

### Angle and Vector Functions

| Function | Description                          | Example                    |
| -------- | ------------------------------------ | -------------------------- |
| `vecx(dir)` | X component of direction vector   | `vecx(3)` = 1 (right)      |
| `vecy(dir)` | Y component of direction vector   | `vecy(0)` = -1 (up)        |
| `getangle(dx, dy)` | Angle from delta x,y          | `getangle(1, 0)` = 0       |
| `degtorad(deg)` | Convert degrees to radians      | `degtorad(180)` ≈ 3.14     |
| `radtodeg(rad)` | Convert radians to degrees      | `radtodeg(3.14)` ≈ 180     |

Use `getdir()` when you need one of Graal's four facing directions, and use `getangle()` when you need a continuous angle for projectiles, rotation, or knockback.

```gs2
function faceAndAimAt(target) {
    temp.dx = target.x - player.x;
    temp.dy = target.y - player.y;

    player.dir = getdir(temp.dx, temp.dy);
    temp.angle = getangle(temp.dx, temp.dy);

    echo("Facing direction: " @ player.dir);
    echo("Projectile angle: " @ temp.angle);
}
```

`vecx()` and `vecy()` convert a direction back into tile movement:

```gs2
function moveForward(distance) {
    player.x += vecx(player.dir) * distance;
    player.y += vecy(player.dir) * distance;
}
```

## Direction Values

In Graal, directions are numbered:
- `0` = Up
- `1` = Left
- `2` = Down
- `3` = Right

## Constants

| Constant | Value                    | Description           |
| -------- | ------------------------ | --------------------- |
| `pi`     | 3.14159265...            | The mathematical π    |

## Practical Examples

### Example 1: Health and Damage System

```gs2
function onCreated() {
    temp.maxHealth = 100;
    temp.currentHealth = temp.maxHealth;
    temp.damage = 25;

    echo("Player starts with " @ temp.currentHealth @ " health");

    temp.currentHealth -= temp.damage;
    echo("Player takes " @ temp.damage @ " damage");
    echo("Player now has " @ temp.currentHealth @ " health");

    if (temp.currentHealth <= 0) {
        echo("Player is dead!");
    } else {
        echo("Player is still alive");
    }
}
```

### Example 2: Experience and Level System

```gs2
function onCreated() {
    temp.currentExp = 250;
    temp.expPerLevel = 100;

    temp.playerLevel = temp.currentExp / temp.expPerLevel;
    temp.leftoverExp = temp.currentExp % temp.expPerLevel;

    echo("Player Level: " @ temp.playerLevel);
    echo("Experience towards next level: " @ temp.leftoverExp @ "/" @ temp.expPerLevel);
}
```

### Example 3: Movement Calculations

```gs2
function onCreated() {
    temp.angle = pi / 4; // 45 degrees
    temp.speed = 2;

    // Calculate movement vector
    temp.dx = cos(temp.angle) * temp.speed;
    temp.dy = sin(temp.angle) * temp.speed;

    echo("Move X: " @ temp.dx);
    echo("Move Y: " @ temp.dy);
}
```
