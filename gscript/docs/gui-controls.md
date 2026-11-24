# GUI Controls Reference

GuiControl is the base GUI control. **All GUI controls inherit from GuiControl**, so the variables, functions, and events listed in the GuiControl section are available to ALL other GUI controls.

**Inheritance Hierarchy:**
```
TGraalVar
  └── GuiControl (base class)
        ├── GuiWindowCtrl
        ├── GuiBitmapBorderCtrl
        ├── GuiScrollCtrl
        ├── GuiStretchCtrl
        ├── GuiFrameSetCtrl
        ├── GuiTextCtrl
        │     ├── GuiTextEditCtrl
        │     │     └── GuiTextEditSliderCtrl
        │     └── GuiPopUpMenuCtrl
        │           └── GuiPopUpEditCtrl
        ├── GuiMLTextCtrl
        │     └── GuiMLTextEditCtrl
        ├── GuiButtonBaseCtrl
        │     ├── GuiButtonCtrl
        │     ├── GuiCheckBoxCtrl
        │     └── GuiRadioCtrl
        ├── GuiTabCtrl
        ├── GuiBitmapButtonCtrl
        ├── GuiBitmapCtrl
        ├── GuiMenuCtrl
        ├── GuiArrayCtrl
        │     ├── GuiTextListCtrl
        │     └── GuiTreeViewCtrl
        ├── GuiShowImgCtrl
        ├── GuiProgressCtrl
        ├── GuiSliderCtrl
        ├── GuiDrawingPanel
        └── GuiContextMenuCtrl
```

**Important:** Every GUI control inherits the common variables, functions, and events from GuiControl. Only control-specific additions are documented for each control type.

## Creating GUI Controls

```gs2
new GuiControl("ControlName") {
    profile = "GuiDefaultProfile";
    x = 100;
    y = 100;
    width = 200;
    height = 100;
}
```

## Common Variables

| Name | Type | Description |
|------|------|-------------|
| `active` | boolean | Whether the control can be used (e.g. button can be clicked) |
| `awake` | boolean (read only) | Whether control is awake/active |
| `canmove` | boolean | Allows the control to be moved by the mouse |
| `canresize` | boolean | Allows the control to be resized by dragging |
| `clipchildren` | boolean | By default true; child controls clipped to bounds |
| `clipmove` | boolean | Control can't move outside parent bounds (default true) |
| `cliptobounds` | boolean | By default true; control clipped to its bounds |
| `controls` | object (read only) | Array of GuiControl (subcontrols) |
| `cursor` | int | Cursor when mouse hovers: default, hand, text, crosshair, column-resize, row-resize, wait, progress, help |
| `editing` | boolean | Whether control is in editing mode |
| `extent` | string | Size as "width height" (e.g. "200 100") |
| `flickering` | boolean | Allows control to periodically show/hide itself |
| `flickertime` | int | Time between show/hide in flickering |
| `height` | int | Height in pixels |
| `hint` | string | Tooltip text displayed on mouse hover |
| `horizsizing` | string | Horizontal resize behavior: "right", "left", "center", "width", "relative" |
| `layer` | int (read only) | Image layer the control is on |
| `minextent` | string | Minimum size as "width height" |
| `minsize` | string | Same as minextent |
| `parent` | object (read only) | Parent GuiControl |
| `position` | string | Position as "x y" |
| `profile` | object | GuiControlProfile for styling |
| `resizeheight` | boolean | Allow height resizing |
| `resizewidth` | boolean | Allow width resizing |
| `scrolllinex` | int | Lines to scroll horizontally |
| `scrollliney` | int | Lines to scroll vertically |
| `showhint` | boolean | Whether to show hint tooltip |
| `useownprofile` | boolean | Set to true before modifying profile to not affect other controls |
| `vertsizing` | string | Vertical resize behavior: "bottom", "top", "center", "height", "relative" |
| `visible` | boolean | Whether the control is visible |
| `width` | int | Width in pixels |
| `x` | int | X position |
| `y` | int | Y position |

## Common Functions

| Function | Description |
|----------|-------------|
| `addControl(control)` | Add a child control inside this control |
| `removeControl(control)` | Remove a child control |
| `clearControls()` | Remove all child controls at once |
| `makeFirstResponder(bool)` | Give this control keyboard focus |
| `isFirstResponder()` | Returns whether this control is the first responder |
| `bringToFront()` | Bring control to front of z-order |
| `pushToBack()` | Push control to back of z-order |
| `show()` | Make control visible |
| `hide()` | Make control invisible |
| `showTop()` | Calls show(), tabFirst() and bringToFront() |
| `destroy()` | Remove and delete the control |
| `getParent()` | Get parent control |
| `getRoot()` | Get root window |
| `globalToLocalCoord({x,y})` | Convert global screen coords to position relative to control origin |
| `localToGlobalCoord({x,y})` | Convert position relative to control origin to global screen coords |
| `resize(x, y, width, height)` | Resize control to specified dimensions |
| `tabFirst()` | When tab is pressed, this control is selected first |

## Common Events

| Event | Parameters | Description |
|-------|------------|-------------|
| `onAdd()` | | Control is added to another control (via addControl) |
| `onRemove()` | | Control is removed from its parent |
| `onShow()` | | Control is shown or awakened while visible |
| `onHide()` | | Control is made hidden |
| `onWake()` | | Control is awakened and becomes visible on screen |
| `onSleep()` | | Window is removed from screen (dialog) |
| `onMove(newx, newy)` | | Control is moved |
| `onResize(neww, newh)` | | Control is resized |
| `onAction()` | | Button pressed, enter in text edit, slider moved |
| `onDialogPush()` | | Dialog control placed on screen (pushDialog) |
| `onDialogPop()` | | Dialog control removed from screen (popDialog) |
| `onKeyDown(keycode, keystr, scancode)` | | Key pressed while control has focus |
| `onKeyUp(keycode, keystr, scancode)` | | Key released while control has focus |
| `onMouseDown(mod, x, y, clicks)` | | Left mouse button pressed |
| `onMouseUp(mod, x, y)` | | Left mouse button released |
| `onMouseEnter(mod, x, y)` | | Mouse moved inside control |
| `onMouseLeave(mod, x, y)` | | Mouse left control |
| `onMouseMove(mod, x, y)` | | Mouse moved |
| `onMouseDragged(mod, x, y)` | | Mouse moved while left button pressed |
| `onRightMouseDown(mod, x, y, clicks)` | | Right mouse button pressed |
| `onRightMouseUp(mod, x, y)` | | Right mouse button released |
| `onRightMouseDragged(mod, x, y)` | | Mouse moved while right button pressed |
| `onMouseWheelUp(mod)` | | Mouse wheel scrolled up |
| `onMouseWheelDown(mod)` | | Mouse wheel scrolled down |
| `onMouseYawPitch(xaxis, yaxis)` | | Mouse event in Graal3D when mouse turned off |
| `onClose()` | | Window close button clicked |

---

## GuiWindowCtrl

A window control with title bar and optional close button.

```gs2
new GuiWindowCtrl("MyWindow") {
    profile = "GuiBlueWindowProfile";
    clientrelative = true;
    canmove = true;
    canresize = true;
    canclose = true;
    text = "Window Title";
}
```

**Additional Variables:**

| Name | Type | Description |
|------|------|-------------|
| `text` | string | Window title text |
| `canclose` | boolean | Show close button |
| `canmaximize` | boolean | Show maximize button |
| `canminimize` | boolean | Show minimize button |

---

## GuiButtonCtrl

A clickable button.

```gs2
new GuiButtonCtrl("MyButton") {
    profile = "GuiBlueButtonProfile";
    text = "Click Me";
    width = 100;
    height = 30;
}

function MyButton.onAction() {
    echo("Button clicked!");
}
```

**Additional Variables:**

| Name | Type | Description |
|------|------|-------------|
| `text` | string | Button text |
| `groupNum` | int | Radio button group number |

---

## GuiCheckBoxCtrl

A checkbox control for boolean options.

```gs2
new GuiCheckBoxCtrl("MyCheckbox") {
    profile = "GuiBlueCheckBoxProfile";
    text = "Enable Option";
}

function MyCheckbox.onAction() {
    if (MyCheckbox.getValue()) {
        echo("Checked!");
    }
}
```

**Functions:**

| Function | Description |
|----------|-------------|
| `getValue()` | Returns true if checked |
| `setValue(bool)` | Set checked state |

---

## GuiRadioButtonCtrl

Radio button for mutually exclusive options.

```gs2
new GuiRadioButtonCtrl("Option1") {
    profile = "GuiBlueRadioButtonProfile";
    text = "Option 1";
    groupNum = 1;
}

new GuiRadioButtonCtrl("Option2") {
    profile = "GuiBlueRadioButtonProfile";
    text = "Option 2";
    groupNum = 1;
}
```

---

## GuiTextEditCtrl

Text input field.

```gs2
new GuiTextEditCtrl("MyInput") {
    profile = "GuiBlueTextEditProfile";
    width = 200;
    height = 20;
    maxlength = 100;
}

function MyInput.onAction() {
    temp.text = MyInput.getValue();
    echo("Entered: " @ temp.text);
}
```

**Additional Variables:**

| Name | Type | Description |
|------|------|-------------|
| `text` | string | Current text |
| `maxlength` | int | Maximum character count |
| `password` | boolean | Display as asterisks |
| `numbersOnly` | boolean | Only accept numbers |

**Functions:**

| Function | Description |
|----------|-------------|
| `getValue()` | Get text content |
| `setText(text)` | Set text content |
| `selectAll()` | Select all text |
| `clear()` | Clear text |

---

## GuiMLTextEditCtrl

Multi-line text edit control.

```gs2
new GuiMLTextEditCtrl("MyMultiInput") {
    profile = "GuiBlueMLTextEditProfile";
    width = 300;
    height = 150;
}
```

---

## GuiScrollCtrl

Scrollable container.

```gs2
new GuiScrollCtrl("MyScroll") {
    profile = "GuiBlueScrollProfile";
    width = 200;
    height = 150;
    hScrollBar = "alwaysOff";
    vScrollBar = "alwaysOn";
}
```

**Variables:**

| Name | Type | Description |
|------|------|-------------|
| `hScrollBar` | string | "alwaysOn", "alwaysOff", "dynamic" |
| `vScrollBar` | string | "alwaysOn", "alwaysOff", "dynamic" |
| `scrollBarThickness` | int | Scrollbar width |

---

## GuiTextCtrl

Display-only text label.

```gs2
new GuiTextCtrl("MyLabel") {
    profile = "GuiBlueTextProfile";
    text = "Label Text";
}
```

---

## GuiMLTextCtrl

Multi-line formatted text display.

```gs2
new GuiMLTextCtrl("MyText") {
    profile = "GuiBlueMLTextProfile";
    text = "<b>Bold</b> and <i>italic</i>";
}
```

**Functions:**

| Function | Description |
|----------|-------------|
| `addText(text, replace)` | Add text content |
| `clearText()` | Clear all text |
| `setScrollTop(pos)` | Scroll to position |

---

## GuiShowImgCtrl

Display an image.

```gs2
new GuiShowImgCtrl("MyImage") {
    image = "block.png";
    x = 100;
    y = 100;
}
```

**Variables:**

| Name | Type | Description |
|------|------|-------------|
| `image` | string | Image filename |
| `red` | float | Red tint (0-1) |
| `green` | float | Green tint (0-1) |
| `blue` | float | Blue tint (0-1) |
| `alpha` | float | Transparency (0-1) |
| `rotation` | float | Rotation in radians |
| `zoom` | float | Zoom factor |

---

## GuiTreeViewCtrl

Tree view for hierarchical data.

```gs2
new GuiTreeViewCtrl("MyTree") {
    profile = "GuiBlueTreeViewProfile";
}

// Add nodes
MyTree.addNode("Root");
MyTree.addNodebypath("Root/Child1", "");
MyTree.addNodebypath("Root/Child2", "");
```

**Functions:**

| Function | Description |
|----------|-------------|
| `addNode(name)` | Add root node |
| `addNodeByPath(path, value)` | Add node at path |
| `clearNodes()` | Remove all nodes |
| `getSelected()` | Get selected node |
| `getSelectedPath()` | Get path of selected node |

---

## GuiPopUpMenuCtrl

Dropdown menu control.

```gs2
new GuiPopUpMenuCtrl("MyDropdown") {
    profile = "GuiBluePopUpProfile";
}

// Add options
MyDropdown.add("Option 1", 1);
MyDropdown.add("Option 2", 2);
MyDropdown.setSelected(1);
```

**Functions:**

| Function | Description |
|----------|-------------|
| `add(text, id)` | Add option |
| `clear()` | Clear all options |
| `setSelected(id)` | Select by ID |
| `getSelected()` | Get selected ID |
| `getSelectedText()` | Get selected text |
| `getSelectedRows()` | Get array of selected rows |
| `forceclose()` | Close dropdown |

---

## GuiBitmapButtonCtrl

Button with custom bitmap images.

```gs2
new GuiBitmapButtonCtrl("MyBitmapBtn") {
    bitmap = "button_normal.png";
    text = "Button";
}
```

---

## GuiSliderCtrl

Slider/trackbar control.

```gs2
new GuiSliderCtrl("MySlider") {
    profile = "GuiBlueSliderProfile";
    range = "0 100";
    value = 50;
}

function MySlider.onAction() {
    temp.val = MySlider.getValue();
    echo("Slider value: " @ temp.val);
}
```

---

## GuiProgressCtrl

Progress bar display.

```gs2
new GuiProgressCtrl("MyProgress") {
    profile = "GuiBlueProgressProfile";
    value = 0.5; // 50%
}
```

---

## GuiDrawingPanel

Canvas for custom drawing.

```gs2
new GuiDrawingPanel("MyCanvas") {
    width = 200;
    height = 200;
}

// Drawing functions
MyCanvas.drawrectangle(10, 10, 50, 50, "red");
MyCanvas.drawtext(10, 70, "Hello", "Arial", 12);
```

**Functions:**

| Function | Description |
|----------|-------------|
| `clear()` | Clear canvas |
| `drawrectangle(x, y, w, h, color)` | Draw rectangle |
| `drawline(x1, y1, x2, y2, color)` | Draw line |
| `drawtext(x, y, text, font, size)` | Draw text |
| `drawimage(x, y, image)` | Draw image |
| `drawimagerectangle(x, y, image, sx, sy, sw, sh)` | Draw image portion |
| `setpen(color)` | Set drawing color |
| `clearrectangle(x, y, w, h)` | Clear rectangle |

---

## GuiContextMenuCtrl

Right-click context menu.

```gs2
new GuiContextMenuCtrl("MyContextMenu") {
    profile = "GuiBlueContextMenuProfile";
}

MyContextMenu.add("Copy", 1);
MyContextMenu.add("Paste", 2);
```

---

## GuiBitmapBorderCtrl

Displays a border made of a bitmap instead of simple lines. Look is defined by profile.

```gs2
new GuiBitmapBorderCtrl("MyBorder") {
    profile = "GuiBitmapBorderProfile";
    x = 10;
    y = 10;
    width = 160;
    height = 80;
}
```

**Variables:**

| Name | Type | Description |
|------|------|-------------|
| `tile` | boolean | Tile the border bitmap |

---

## GuiStretchCtrl

Stretches child controls to fit the control size. Useful for games inside GUI.

```gs2
new GuiStretchCtrl("MyStretch") {
    x = 10;
    y = 10;
    width = 160;
    height = 120;
    clientwidth = 176;   // Define the "virtual" area
    clientheight = 70;   // that gets stretched to actual size
}
```

**Variables:**

| Name | Type | Description |
|------|------|-------------|
| `clientwidth` | int | Width of area to stretch |
| `clientheight` | int | Height of area to stretch |
| `clientextent` | string | Combined as "{width,height}" |

Use `globalToLocalCoord()` and `localToGlobalCoord()` to translate between real mouse positions and scaled positions.

---

## GuiFrameSetCtrl

Container with resizable frames/panels.

```gs2
new GuiFrameSetCtrl("MyFrames") {
    profile = "GuiDefaultProfile";
    x = 10;
    y = 10;
    width = 300;
    height = 200;
    columns = 2;
    rows = 2;
}
```

---

## GuiTextEditSliderCtrl

Text edit field with attached slider for numeric values.

```gs2
new GuiTextEditSliderCtrl("MySliderEdit") {
    profile = "GuiBlueTextEditProfile";
    width = 100;
    height = 20;
    range = "0 100";
}
```

---

## GuiTabCtrl

Tab container for organizing content in tabs.

```gs2
new GuiTabCtrl("MyTabs") {
    profile = "GuiBlueTabProfile";
    width = 300;
    height = 200;
}

// Add tabs
MyTabs.add("Tab 1", 1);
MyTabs.add("Tab 2", 2);
```

---

## GuiMenuCtrl

Menu bar control.

```gs2
new GuiMenuCtrl("MyMenu") {
    profile = "GuiBlueMenuProfile";
    width = 400;
    height = 20;
}
```

---

## GuiPopUpEditCtrl

Editable dropdown combo box.

```gs2
new GuiPopUpEditCtrl("MyComboEdit") {
    profile = "GuiBluePopUpEditProfile";
    width = 150;
    height = 20;
}

MyComboEdit.add("Option 1", 1);
MyComboEdit.add("Option 2", 2);
```

---

## GuiTextListCtrl

List of text items (inherits from GuiArrayCtrl).

```gs2
new GuiScrollCtrl("ListScroll") {
    width = 200;
    height = 150;

    new GuiTextListCtrl("MyList") {
        profile = "GuiBlueTextListProfile";
    }
}

// Add items
MyList.addRow(1, "Item 1");
MyList.addRow(2, "Item 2");
MyList.addRow(3, "Item 3");
```

**Functions:**

| Function | Description |
|----------|-------------|
| `addRow(id, text)` | Add a row |
| `clear()` | Clear all rows |
| `getSelectedId()` | Get selected row ID |
| `getSelectedText()` | Get selected row text |
| `setSelectedId(id)` | Select by ID |
| `setRowCount(count)` | Set number of rows |

---

## GuiBitmapCtrl

Simple bitmap/image display.

```gs2
new GuiBitmapCtrl("MyBitmap") {
    bitmap = "image.png";
    x = 100;
    y = 100;
}
```

**Variables:**

| Name | Type | Description |
|------|------|-------------|
| `bitmap` | string | Image filename |

---

## Finding Controls

```gs2
// Find by name
temp.ctrl = findObject("ControlName");

// Find in hierarchy
temp.ctrl = MyWindow.findObject("ChildControl");
```

## Dialog Management

```gs2
// Push as modal dialog
pushDialog(MyWindow);

// Pop dialog
popDialog();

// Pop all dialogs
popAllDialogs();
```

## Profile Modification

```gs2
// Use own profile to not affect others
profile = "GuiBlueButtonProfile";
useOwnProfile = true;
profile.fontColor = {255, 0, 0};
```
