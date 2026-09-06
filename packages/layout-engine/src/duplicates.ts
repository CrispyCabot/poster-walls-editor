/**
 * Placements are stored per wall, so nothing stops the same poster being hung
 * on more than one wall. That's allowed — but worth flagging, since it's easy
 * to do by accident (e.g. forgetting a poster was already placed elsewhere).
 */
export function findDuplicatePlacements(
  walls: readonly { id: string; name: string }[],
  placementsByWall: Readonly<Record<string, readonly { posterId: string }[]>>,
): Map<string, string[]> {
  const wallNamesByPoster = new Map<string, string[]>();

  for (const wall of walls) {
    // De-duplicated per wall first, so two placements of the same poster on
    // one wall (which should not normally happen) cannot masquerade as it
    // being on two different walls.
    const postersOnWall = new Set(
      (placementsByWall[wall.id] ?? []).map((p) => p.posterId),
    );
    for (const posterId of postersOnWall) {
      const names = wallNamesByPoster.get(posterId);
      if (names === undefined) {
        wallNamesByPoster.set(posterId, [wall.name]);
      } else {
        names.push(wall.name);
      }
    }
  }

  for (const [posterId, names] of wallNamesByPoster) {
    if (names.length < 2) wallNamesByPoster.delete(posterId);
  }

  return wallNamesByPoster;
}
