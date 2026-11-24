# Strings

**Strings** are sequences of text used to store words, phrases, or any other set of characters. They are very important because much of the interaction between the player and the game happens through text.

## String Concatenation

### SPC Operator

The `SPC` operator **concatenates strings with a space between them**:

```gs2
echo("Hello" SPC "World");
// Output: Hello World
```

### @ Operator

The `@` operator concatenates strings **without** adding a space:

```gs2
echo("Hello" @ "World");
// Output: HelloWorld

echo("Hello" @ " " @ "World");
// Output: Hello World
```

### Combining Text and Variables

```gs2
function onCreated() {
    temp.name = "Alice";
    temp.level = 25;

    echo("Welcome, " @ temp.name @ "!");
    echo("You are level " SPC temp.level);
}
```

## String Methods

### length()

Returns the **length of a string** (number of characters):

```gs2
echo("Hello".length());       // Output: 5
echo("GraalScript".length()); // Output: 11
```

### upper() and lower()

Convert string case:

```gs2
echo("hello".upper()); // Output: HELLO
echo("WORLD".lower()); // Output: world

// Useful for case-insensitive comparisons
if (player.chat.lower() == "hello") {
    // Matches "hello", "HELLO", "Hello", etc.
}
```

### substring(start, end)

Extract a portion of a string:

```gs2
echo("GraalScript".substring(0, 5));  // Output: Graal
echo("GraalScript".substring(5, 11)); // Output: Script
echo("GraalScript".substring(5));     // Output: Script (to end)
```

### pos(substring)

Returns the **position (index)** of a substring within a string. Returns `-1` if not found:

```gs2
echo("GraalScript".pos("Script")); // Output: 5
echo("GraalScript".pos("Java"));   // Output: -1

// Check if string contains something
if ("Hello World".pos("World") >= 0) {
    echo("Found it!");
}
```

### tokenize(delimiter)

Splits a string into an array based on a delimiter:

```gs2
temp.str = "apple,banana,cherry";
temp.arr = temp.str.tokenize(",");

echo(temp.arr[0]); // Output: apple
echo(temp.arr[1]); // Output: banana
echo(temp.arr[2]); // Output: cherry
```

If no delimiter is specified, defaults to spaces and commas:

```gs2
temp.tokens = "hello world test".tokenize();
// Result: {"hello", "world", "test"}
```

When tokenizing by newline, GraalScript also skips carriage returns (`\r`) that appear before newlines. This is useful when processing text loaded from files or copied from Windows-style line endings:

```gs2
temp.lines = "line1\nline2\nline3".tokenize("\n");

for (temp.line : temp.lines) {
    echo(temp.line.trim());
}
```

### charat(position)

Returns the character at the given zero-based position:

```gs2
temp.text = "hello";
echo(temp.text.charat(0)); // Output: h

for (temp.i = 0; temp.i < temp.text.length(); temp.i++) {
    echo(temp.text.charat(temp.i));
}
```

### ends(text)

Checks whether a string ends with the given suffix:

```gs2
temp.filename = "image.png";
if (temp.filename.ends(".png")) {
    echo("PNG file");
}

if (player.chat.ends("!")) {
    echo("Excited chat");
}
```

## String Functions

### strlen(string)

Returns the length of a string:

```gs2
temp.len = strlen("hello");
echo(temp.len); // Output: 5
```

### strpos(string, substring)

Returns position of substring, or -1 if not found:

```gs2
temp.pos = strpos("hello world", "world");
echo(temp.pos); // Output: 6
```

### strequals(str1, str2)

Checks if two strings are equal:

```gs2
if (strequals(temp.a, temp.b)) {
    echo("Strings are equal!");
}
```

### strcmp(str1, str2)

Compares two strings (returns 0 if equal):

```gs2
if (strcmp(temp.a, temp.b) == 0) {
    echo("Strings are equal!");
}
```

### starts(text)

Checks if a string starts with specific text:

```gs2
if (player.chat.starts("/warp")) {
    // Handle warp command
}

if (player.level.starts("overworld_")) {
    // Player is in overworld level
}
```

### trim()

Removes leading and trailing whitespace:

```gs2
temp.userInput = "  my name  ";
temp.clean = temp.userInput.trim();
echo(temp.clean); // Output: "my name"
```

`trim()` is commonly used after `tokenize()` when parsing commands, file data, or comma-separated values:

```gs2
temp.parts = " sword, shield, potion ".tokenize(",");
for (temp.part : temp.parts) {
    echo(temp.part.trim());
}
```

### escape()

Escapes special characters for safe database queries:

```gs2
temp.safe = player.account.escape();
// Adds backslashes before ", ', and \
```

## String Conversion

### Converting Numbers to Strings

Numbers are automatically converted when concatenated:

```gs2
temp.num = 42;
echo("The answer is " @ temp.num);
```

### Converting Strings to Numbers

```gs2
temp.str = "42";
temp.num = temp.str + 0; // Convert to number by adding 0
```

### int(value)

Converts to integer (truncates decimal):

```gs2
temp.val = int(3.7);
echo(temp.val); // Output: 3
```

## Practical Examples

### Example 1: Parsing Chat Commands

```gs2
function onPlayerChats() {
    temp.msg = player.chat;

    if (temp.msg.starts("/warp")) {
        temp.parts = temp.msg.tokenize(" ");
        temp.levelName = temp.parts[1];
        echo("Warping to: " @ temp.levelName);
    }
}
```

### Example 2: Processing Comma-Separated Values

```gs2
function onCreated() {
    temp.data = "Ruan,100,Warrior,25";
    temp.parts = temp.data.tokenize(",");

    temp.name = temp.parts[0];
    temp.health = temp.parts[1];
    temp.class = temp.parts[2];
    temp.level = temp.parts[3];

    echo("Player: " @ temp.name);
    echo("Health: " @ temp.health);
    echo("Class: " @ temp.class);
    echo("Level: " @ temp.level);
}
```

### Example 3: Formatting Player Names

```gs2
function formatName(name) {
    // Capitalize first letter, lowercase rest
    temp.first = name.substring(0, 1).upper();
    temp.rest = name.substring(1).lower();
    return temp.first @ temp.rest;
}

function onCreated() {
    echo(formatName("ALICE")); // Output: Alice
    echo(formatName("bob"));   // Output: Bob
}
```

### Example 4: Validating Input

```gs2
function isValidName(name) {
    // Check length
    if (name.length() < 3 || name.length() > 20) {
        return false;
    }

    // Check for invalid characters
    if (name.pos("@") >= 0 || name.pos("#") >= 0) {
        return false;
    }

    return true;
}
```

## String Comparison Best Practices

### Case-Insensitive Comparison

```gs2
// Good: Case-insensitive
if (player.chat.lower() == "hello") {
    echo("Hi there!");
}

// Bad: Case-sensitive (won't match "Hello" or "HELLO")
if (player.chat == "hello") {
    echo("Hi there!");
}
```

### Partial Matching

```gs2
// Check if chat contains a word
if (player.chat.lower().pos("help") >= 0) {
    echo("Do you need assistance?");
}
```
