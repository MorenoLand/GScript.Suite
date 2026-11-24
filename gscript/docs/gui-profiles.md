# GUI Profiles Reference

GUI profiles define how GUI controls look. By default, controls use a default profile for their type (e.g., `GuiButtonCtrl` uses `GuiButtonProfile`).

## Creating Profiles

```gs2
new GuiControlProfile("MyProfile") {
    fillColor = {255, 0, 0};
    fontColor = {255, 255, 255};
    bitmap = "myEvilImage.png";
    opaque = false;
    transparency = 0.5;
}
```

## Copying Existing Profiles

```gs2
// Copy from existing profile
new GuiButtonProfile("MyButtonProfile") {
    fontsize = 20;
}
```

## Applying Profiles

```gs2
new GuiControl("ControlName") {
    profile = "MyProfile";
}
```

## Profile Attributes

### Layout & Sizing

| Attribute | Type | Description |
|-----------|------|-------------|
| `align` | string | Text justification: "left", "center", "right" |
| `autosizeheight` | boolean | Auto-adjust height to content |
| `autosizewidth` | boolean | Auto-adjust width to content |
| `justify` | string | Same as align |
| `linespacing` | int | Pixels between lines in multiline controls |
| `textoffset` | string | Text offset from top-left |

### Colors

All color values use format: `{red, green, blue, alpha}` (0-255)

| Attribute | Description |
|-----------|-------------|
| `borderColor` | Default border color |
| `borderColorHL` | Border color when active |
| `borderColorNA` | Border color when disabled |
| `fillColor` | Default background color |
| `fillColorHL` | Background color when active |
| `fillColorNA` | Background color when disabled |
| `fontColor` | Default font color |
| `fontColorHL` | Font color when highlighted |
| `fontColorNA` | Font color when disabled |
| `fontColorSEL` | Font color of selected text |
| `fontColorLink` | Font color of links |
| `fontColorLinkHL` | Font color of links when active |
| `shadowColor` | Color of text shadow |
| `cursorColor` | Color of cursor (caret) in text box |

### Borders

| Attribute | Type | Description |
|-----------|------|-------------|
| `border` | int (0-5) | Border style |
| `borderThickness` | int | Border size in pixels |

**Border Values:**

| Value | Style |
|-------|-------|
| 0 | No border |
| 1 | Single-color border using borderColor |
| 2 | Rectangle using white and borderColorNA |
| 3 | Lowered rectangle using white, fillColor, borderColorNA |
| 4 | Raised rectangle using white, black, borderColor |
| 5 | Bitmap border |

### Font

| Attribute | Type | Description |
|-----------|------|-------------|
| `fontType` | string | Font name, e.g., "Tempus Sans ITC" |
| `fontSize` | int | Font size |
| `fontStyle` | string | Style combination: "b" (bold), "i" (italic), "u" (underline), "s" (strikeout), "c" (centered), "r" (right aligned) |

Example: `"bi"` for bold italic

### Appearance

| Attribute | Type | Description |
|-----------|------|-------------|
| `bitmap` | string | Image template filename |
| `opaque` | boolean | If true, transparency is ignored |
| `transparency` | float | Alpha transparency (0 to 1) |
| `textShadow` | boolean | Enable text shadow |
| `shadowOffset` | array | Shadow position as `{offsetx, offsety}` |

### Behavior

| Attribute | Type | Description |
|-----------|------|-------------|
| `canKeyFocus` | boolean | Can this control get keyboard focus |
| `modal` | boolean | Can be focused and steals input |
| `mouseOverSelected` | boolean | Mouse hover acts as selection |
| `numbersOnly` | boolean | Only accept numbers |
| `returnTab` | boolean | |
| `tab` | boolean | |

### Sound

| Attribute | Type | Description |
|-----------|------|-------------|
| `soundButtonDown` | string | Sound when clicked |
| `soundButtonOver` | string | Sound when hovered |

## Control-Specific Profiles

Each control type has a default profile:

| Control | Default Profile |
|---------|----------------|
| GuiControl | GuiDefaultProfile |
| GuiWindowCtrl | GuiWindowProfile |
| GuiButtonCtrl | GuiButtonProfile |
| GuiTextCtrl | GuiTextProfile |
| GuiTextEditCtrl | GuiTextEditProfile |
| GuiCheckBoxCtrl | GuiCheckBoxProfile |
| GuiRadioButtonCtrl | GuiRadioButtonProfile |
| GuiScrollCtrl | GuiScrollProfile |
| GuiTreeViewCtrl | GuiTreeViewProfile |

## Built-in Blue Profiles

Graal provides a set of blue-themed profiles:

- `GuiBlueWindowProfile`
- `GuiBlueButtonProfile`
- `GuiBlueTextProfile`
- `GuiBlueTextEditProfile`
- `GuiBlueCheckBoxProfile`
- `GuiBlueRadioButtonProfile`
- `GuiBlueScrollProfile`
- `GuiBlueMLTextProfile`
- `GuiBlueMLTextEditProfile`
- `GuiBlueTreeViewProfile`
- `GuiBluePopUpProfile`
- `GuiBlueSliderProfile`
- `GuiBlueProgressProfile`

## useOwnProfile

When modifying a control's profile directly, use `useOwnProfile = true` to prevent affecting other controls using the same profile:

```gs2
new GuiButtonCtrl("MyButton") {
    profile = "GuiBlueButtonProfile";
    useOwnProfile = true;
    profile.fontColor = {255, 0, 0}; // Only affects this button
    profile.transparency = 1;
}
```

Without `useOwnProfile`:

```gs2
// This affects ALL controls using "MyProfile"
profile = "MyProfile";
profile.transparency = 1;
```

With `useOwnProfile`:

```gs2
// Only affects this control
profile = "MyProfile";
useOwnProfile = true;
profile.transparency = 1;
```

## Complete Example

```gs2
// Define custom profile
new GuiControlProfile("CustomWindowProfile") {
    // Background
    fillColor = {40, 40, 60, 255};
    fillColorHL = {50, 50, 70, 255};

    // Border
    border = 4;
    borderColor = {100, 100, 150};
    borderThickness = 2;

    // Font
    fontType = "Arial";
    fontSize = 14;
    fontColor = {255, 255, 255};
    fontStyle = "b";

    // Shadow
    textShadow = true;
    shadowColor = {0, 0, 0, 128};
    shadowOffset = {1, 1};

    // Transparency
    opaque = false;
    transparency = 0.9;
}

// Use the profile
new GuiWindowCtrl("MainWindow") {
    profile = "CustomWindowProfile";
    x = 100;
    y = 100;
    width = 300;
    height = 200;
    text = "Custom Window";
}
```
