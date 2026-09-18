# Session notes — 18 September 2026

Web app changes. The Revit add-in half is in `Sportify_Revit_and_API` on the
same branch name.

---

## 1. The Garden tab is gone

A court has a size; a garden has an area. A handball court is 40 × 20 because
IHF says so. A green patch is whatever shape the design leaves for it — so
typing `10 × 6` into a tab and dragging that rectangle in was treating a garden
like a court, and the number was fiction.

**Replaced by ground zones**, drawn directly on the Combine canvas:

- **Zones** button in the left rail, where Garden used to be. Opens a panel over
  the roof rather than switching workspace.
- Choose what you are drawing → the build-up list narrows to systems that suit
  it → drag the zone out. The drag is the size.
- Select, move, resize by the corners, `Delete` to remove.

**Only one zone kind now: Green roof.** The old six (planting bed / lawn /
trees / urban farming / walkway) did not survive the question "what is the
difference" — they were mostly names for "an area with plants in it", differing
only in what is planted, which is not a property of the ground. Extensive vs
intensive already lives in the build-up system.

**Pedestrian walkway removed entirely** — circulation is the negative space
between things, not an area someone draws. Its build-up stays in the catalog
for whenever the app decides what leftover ground is made of.

### Rules on zones

- A court cannot be dropped, dragged, or have a zone drawn over it — enforced
  in both directions.
- A clash that exists anyway (a loaded layout, an edit) is drawn red and dashed
  and reported in the status line.
- Zones are checked against the roof boundary.
- **Walkability is deliberately not implemented.** Whether circulation should
  route through a lawn but not a planting bed is a real design question.

---

## 2. Vegetation is objects, not ground

A tree has a position, a crown and a root ball. You place one. So planting sits
with courts and equipment, not with the ground.

- **Plants** button in the rail, beside Zones.
- **Real species, not size categories.** "Small tree" is not something a nursery
  supplies or a Revit family represents; *Cornus mas* is.
- Dimensions come *with* the species. The crown slider only moves within the
  range that plant is actually grown to.
- Crowns draw as circles, with the trunk at the centre.

Trees are the four Van den Berk specifically recommends for roof gardens, with
their published mature heights and crown widths, plus lavender, blue fescue and
a sedum mat.

### The rule that connects the two halves

Every plant carries a minimum substrate depth. A green roof carries a real
substrate layer. So a plant standing on bare roof, or on a build-up too shallow
for it, is reported.

Only the **substrate** layer counts — drainage and protection add build-up
height but nothing a root can occupy.

> Worth knowing: **no catalogued system can currently carry a tree.** Trees need
> 800 mm (Van den Berk's own roof guidance); ZinCo's deepest is 250 mm. The app
> flags every tree placement as a result. That is a real constraint, not a bug.

---

## 3. Real provider build-up systems

The garden configurator's "material quality: low / medium / high" named nothing
a designer or a supplier would recognise. A green roof is not composed layer by
layer — ZinCo, Bauder and Optigrün sell a **named system** with a fixed
build-up, and specifying one means naming that system.

Five systems seeded from three German providers, with their real layers.

**Every layer thickness is marked `published` or `typical`** — published means
the manufacturer prints that figure, typical means it is a normal value used so
the build-up resolves to real geometry. Geometry needs a number for every layer;
someone writing a tender needs to know which numbers came from the supplier.

System-level figures (build-up depth, saturated weight, water storage) are left
**blank** where a manufacturer does not publish them, rather than guessed —
those are what an engineer checks a deck against.

### Thickness comes from the layers

The build-up total is the sum of the layers, not a typed field, because the
layers *are* the thickness and Revit builds from them. The manufacturer's
published total is kept as a **cross-check**, and a disagreement is flagged.

> This immediately exposed one: ZinCo publishes 318 mm for Roof Garden, our
> layers come to 418 mm. They state only the substrate depth, and the typical
> values fill past their stated total. **Revit builds the 418 mm version.**
> Those typical values want checking against a datasheet.

---

## 4. Catalogs moved to the database

Build-ups and species were JavaScript constants, so adding a ZinCo product or a
tree meant a code change and a deploy. They now come from the reference API, so
adding one is a form in the Data tab.

**No fallback, deliberately.** A built-in copy that quietly stands in when the
API is down means two catalogs that drift apart and a designer specifying from
the stale one without knowing. Both panels say plainly that the database is
unavailable and offer a retry.

**The API must be running** for Zones and Plants to work. It does *not* need
PostgreSQL — the reference data is SQLite and creates itself:

```
cd Sportify.Api/Sportify.Api
dotnet run --launch-profile http
```

---

## 5. Data tab

- **Species** and **Build-ups** domains added. The trees were in the database all
  along with nothing displaying them — the old "Vegetation" domain fetches plant
  *palettes* (groupings), not species. Renamed to **Palettes**, since that is
  what it shows.
- **A dedicated build-up editor.** The generic form asks "what kind of record?"
  and shows flat text boxes — standing in Build-ups and being offered Material /
  Provider / Sport / Plant is nonsense, and a build-up is a system *plus* ordered
  layers anyway. The new editor has a layer table with add, delete and reorder,
  because the sequence is the specification.
- Edit and Delete sit on each card rather than behind a picker.

**Still open:** the Species domain uses the generic form, which has no fields for
the roof dimensions. That is why the eight originally-seeded plants show *"no
roof dimensions"* and cannot yet be filled in from the UI.

---

## 6. Export payload

New in the Combine export:

| Field | What it carries |
|---|---|
| `zones[]` | Each drawn zone — rectangle and its build-up key |
| `assemblies[]` | Distinct build-ups used, with full layer stacks |
| `placements[].parameters.vegetation` | Species, crown, **mature height**, substrate need, source |
| `roof_context.world_origin_z_m` | Roof elevation |

Mature height travels whether or not this app uses it — a shading, wind or
clearance study needs it and cannot recover it from a plan footprint.

---

## 7. Smaller things

- **Smart recommendation toggle.** It recalculated on every drag; the choice is
  remembered so it does not come back each session.
- **Cache busting.** Every local script is versioned with a build string, and
  exports carry it. Without this a cached page is invisible: the fix sits on
  disk, the export silently lacks its fields, and both sides look correct. This
  cost real time before it was fixed.
  **Run `python bump-build.py <name>` after any JavaScript change**, or the
  browser will keep running the old code.
- **Data tab cache fix.** Creating a record reported success while the list
  stayed unchanged — it re-rendered from the copy fetched before the write.

---

## Try it

1. Start the API (above), then serve the app.
2. Revit → **Push Roof to Sportify**.
3. **Zones** → pick a system → **Draw on the roof**.
4. **Plants** → pick a species → **Push to Combine** → drag onto the zone.
5. **Export Combined JSON** → Revit → **Import Configuration**.
