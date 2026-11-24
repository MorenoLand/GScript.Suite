# Functions

Functions are containers that hold a set of instructions you want to use over and over again. Instead of writing the same code multiple times, you can put it in a function and call that function whenever you need it.

## What is a Function?

A **function** is simply a block of code with a name:

```gs2
function functionName() {
    // Your instructions go here
}
```

- **`function`**: Keyword that tells GraalScript you're creating a function
- **`functionName`**: The name you give your function (choose something descriptive!)
- **`()`**: Parentheses for parameters
- **`{}`**: Curly braces contain all the code that runs when you call the function

## Event Functions vs Custom Functions

### Event Functions (Automatic)

Some functions are **automatically called** by the game when certain things happen:

```gs2
function onCreated() {
    echo("This runs when the script starts!");
}

function onPlayerEnters() {
    echo("This runs when a player enters the level!");
}

function onPlayerChats() {
    echo("This runs when a player sends a chat message!");
}
```

You don't need to call these yourself - the game calls them for you when the right event happens.

### Custom Functions (You Call Them)

You can also create your own functions for code you want to reuse:

```gs2
function sayHello() {
    echo("Hello World!");
}

function onCreated() {
    sayHello();  // This calls our custom function
    sayHello();  // We can call it multiple times!
}
```

**Output:**
```
Hello World!
Hello World!
```

## Why Use Functions?

### 1. Avoid Repeating Code

**Without functions (repetitive):**

```gs2
function onCreated() {
    echo("Welcome to the game!");
    echo("Have fun playing!");
    echo("Good luck!");

    // Later in your code...
    echo("Welcome to the game!");
    echo("Have fun playing!");
    echo("Good luck!");
}
```

**With functions (clean and reusable):**

```gs2
function showWelcomeMessage() {
    echo("Welcome to the game!");
    echo("Have fun playing!");
    echo("Good luck!");
}

function onCreated() {
    showWelcomeMessage();
    // Later in your code...
    showWelcomeMessage();
}
```

### 2. Organize Your Code

```gs2
function setupPlayer() {
    // Code to set up a new player
}

function giveStartingItems() {
    // Code to give items to player
}

function showTutorial() {
    // Code to show tutorial
}

function onCreated() {
    setupPlayer();
    giveStartingItems();
    showTutorial();
}
```

## Function Parameters (Inputs)

**Parameters** let you send information to a function, making it more flexible and powerful.

### Basic Parameter Example

```gs2
function greetPlayer(playerName) {
    echo("Hello, " @ playerName @ "!");
}

function onCreated() {
    greetPlayer("Alice");
    greetPlayer("Bob");
    greetPlayer("Charlie");
}
```

**Output:**
```
Hello, Alice!
Hello, Bob!
Hello, Charlie!
```

### Multiple Parameters

```gs2
function createWelcomeMessage(playerName, playerLevel, serverName) {
    echo("Welcome " @ playerName @ "!");
    echo("You are level " @ playerLevel);
    echo("You are now playing on " @ serverName);
}

function onCreated() {
    createWelcomeMessage("Alice", 25, "Adventure Server");
}
```

## Functions That Return Values

Sometimes you want a function to **give you back** a result instead of just doing something.

### Basic Return Example

```gs2
function addTwoNumbers(a, b) {
    temp.result = a + b;
    return temp.result;  // Give back the result
}

function onCreated() {
    temp.sum = addTwoNumbers(5, 3);
    echo("5 + 3 = " @ temp.sum);
}
```

**Output:** `5 + 3 = 8`

### Practical Example: Health Percentage

```gs2
function getHealthPercentage(currentHealth, maxHealth) {
    temp.percentage = (currentHealth / maxHealth) * 100;
    return temp.percentage;
}

function onCreated() {
    temp.playerHealth = 75;
    temp.maxPlayerHealth = 100;

    temp.healthPercent = getHealthPercentage(temp.playerHealth, temp.maxPlayerHealth);
    echo("Player health: " @ temp.healthPercent @ "%");

    if (temp.healthPercent < 25) {
        echo("Warning: Low health!");
    }
}
```

### Return vs No Return

```gs2
// Function that DOES something (no return needed)
function printPlayerStats(name, level) {
    echo("Player: " @ name);
    echo("Level: " @ level);
}

// Function that CALCULATES something (return the result)
function calculateExpNeeded(currentLevel) {
    temp.expNeeded = currentLevel * 100;
    return temp.expNeeded;
}

function onCreated() {
    printPlayerStats("Alice", 10);  // Just prints info

    temp.expRequired = calculateExpNeeded(10);  // Gets a value back
    echo("EXP needed for next level: " @ temp.expRequired);
}
```

## Best Practices for Functions

### 1. Use Descriptive Names

```gs2
// Good - tells you exactly what it does
function calculatePlayerDamage(baseDamage, level) {
    return baseDamage + (level * 2);
}

// Bad - unclear what it does
function calc(x, y) {
    return x + (y * 2);
}
```

### 2. Keep Functions Small and Focused

```gs2
// Good - each function has one clear purpose
function getPlayerLevel(experience) {
    return experience / 100;
}

function getHealthColor(healthPercent) {
    if (healthPercent > 50) return "green";
    if (healthPercent > 25) return "yellow";
    return "red";
}

// Bad - function does too many different things
function doEverything(exp, health, maxHealth) {
    temp.level = exp / 100;
    temp.healthPercent = (health / maxHealth) * 100;
    // ... too much in one function
}
```

### 3. Use Parameters Instead of Global Variables When Possible

```gs2
// Good - function is self-contained
function calculateTax(price, taxRate) {
    return price * taxRate;
}

// Less ideal - relies on external variables
function calculateTax() {
    return this.price * this.taxRate;  // Depends on external variables
}
```

## Summary

Functions help you:
- **Organize your code** into logical pieces
- **Avoid repetition** by reusing code
- **Make your code easier to read** and understand
- **Create reusable tools** with parameters and return values
