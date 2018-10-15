/**
 * @enum {number}
 * @property {number} NORTH
 * @property {number} EAST
 * @property {number} SOUTH
 * @property {number} WEST
 * @memberOf vcs.oblique
 * @api
 */
export const ViewDirection = {
  NORTH: 1,
  EAST: 2,
  SOUTH: 3,
  WEST: 4,
};

/**
 * @type {Object<string, vcs.oblique.ViewDirection>}
 * @memberOf vcs.oblique
 * @export
 */
export const viewDirectionNames = {
  north: ViewDirection.NORTH,
  east: ViewDirection.EAST,
  south: ViewDirection.SOUTH,
  west: ViewDirection.WEST,
};

/**
 * @param {number} direction
 * @return {string | undefined}
 */
export function getDirectionName(direction) {
  return Object.keys(viewDirectionNames)
    .find((name => viewDirectionNames[name] === direction));
}
