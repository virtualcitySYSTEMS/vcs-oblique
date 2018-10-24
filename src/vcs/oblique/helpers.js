/* eslint-disable no-continue,no-console */
import { get as getProjection, getTransform, transform } from 'ol/proj';
import { boundingExtent, getBottomLeft, getBottomRight, getTopRight, getTopLeft } from 'ol/extent';
import { ViewDirection } from './viewDirection';

/**
 * returns distance between two coordinates
 * @param {ol.Coordinate} point0
 * @param {ol.Coordinate} point1
 * @return {number};
 */
export function cartesian2DDistance(point0, point1) {
  const distX = point0[0] - point1[0];
  const distY = point0[1] - point1[1];
  return Math.sqrt((distX * distX) + (distY * distY));
}

/**
 * sorts the corner points of the json after [lower left, lower right, upper right, upper left]
 * 3----2   ^
 * |    |   |
 * 0----1 north
 * @param {Array<ol.Coordinate>} inputCornerPoints
 * @param {(vcs.oblique.ViewDirection|boolean)=} [sortDirection=false]
 * @return {Array<ol.Coordinate>}
 */
export function sortRealWordEdgeCoordinates(inputCornerPoints, sortDirection = false) {
  const cornerPoints = inputCornerPoints.slice();
  const extent = boundingExtent(cornerPoints);
  const extentPoints = [
    getBottomLeft(extent),
    getBottomRight(extent),
    getTopRight(extent),
    getTopLeft(extent),
  ];

  let sorted = extentPoints.map((extentPoint) => {
    let closest = 0;
    let distance = Infinity;
    cornerPoints.forEach((cornerPoint, cornerIndex) => {
      const currentDistance = cartesian2DDistance(extentPoint, cornerPoint);
      if (currentDistance < distance) {
        distance = currentDistance;
        closest = cornerIndex;
        closest = cornerIndex;
      }
    });
    return cornerPoints.splice(closest, 1)[0];
  });
  if (sortDirection === ViewDirection.EAST) {
    sorted = [sorted[3], sorted[0], sorted[1], sorted[2]];
  } else if (sortDirection === ViewDirection.SOUTH) {
    sorted = [sorted[2], sorted[3], sorted[0], sorted[1]];
  } else if (sortDirection === ViewDirection.WEST) {
    sorted = [sorted[1], sorted[2], sorted[3], sorted[0]];
  }
  return sorted;
}

/**
 * @param {Array<number>} v1
 * @param {Array<number>} v2
 * @return {number|null}
 * @todo check for Cesium function instead?
 */
function angleBetweenTwo2DVectors(v1, v2) {
  const cosUpper = (v1[0] * v2[0]) + (v1[1] * v2[1]);
  const cosLower = Math.sqrt((v1[0] ** 2) + (v1[1] ** 2)) * Math.sqrt((v2[0] ** 2) + (v2[1] ** 2));
  if (cosLower === 0) {
    console.error('caught div by 0 in angleBetweenTwo2DVectors');
    return null;
  }

  let number = cosUpper / cosLower;
  const thresh = 1.00000002;
  if (number < thresh * (-1) || number > thresh) {
    console.error('Number is much smaller than -1 or much larger than 1 in angleBetweenTwo2DVectors');
    return null;
  }

  if (number < -1 || number > 1) {
    number = Math.round(number);
  }

  return Math.acos(number);
}

/**
 * taken from http://jsfiddle.net/justin_c_rounds/Gd2S2/
 * @param {Array<ol.Coordinate>} segment1
 * @param {Array<ol.Coordinate>} segment2
 * @return {{x: (number|null), y:(number|null), onLine1: boolean, onLine2: boolean}}
 * @todo check editor helpers for line intersection
 */
export function checkLineIntersection(segment1, segment2) {
  // if the lines intersect, the result contains the x and y of the intersection (treating the lines as infinite) and booleans for whether line segment 1 or line segment 2 contain the point
  const [[line1StartX, line1StartY], [line1EndX, line1EndY]] = segment1;
  const [[line2StartX, line2StartY], [line2EndX, line2EndY]] = segment2;
  let a;
  let b;

  const result = {
    x: null,
    y: null,
    onLine1: false,
    onLine2: false,
  };

  const denominator =
    ((line2EndY - line2StartY) * (line1EndX - line1StartX)) -
    ((line2EndX - line2StartX) * (line1EndY - line1StartY));

  if (denominator === 0) {
    return result;
  }
  a = line1StartY - line2StartY;
  b = line1StartX - line2StartX;
  const numerator1 = ((line2EndX - line2StartX) * a) - ((line2EndY - line2StartY) * b);
  const numerator2 = ((line1EndX - line1StartX) * a) - ((line1EndY - line1StartY) * b);
  a = numerator1 / denominator;
  b = numerator2 / denominator;

  // if we cast these lines infinitely in both directions, they intersect here:
  result.x = line1StartX + (a * (line1EndX - line1StartX));
  result.y = line1StartY + (a * (line1EndY - line1StartY));
  /*
   // it is worth noting that this should be the same as:
   x = line2StartX + (b * (line2EndX - line2StartX));
   y = line2StartX + (b * (line2EndY - line2StartY));
   */
  // if line1 is a segment and line2 is infinite, they intersect if:
  if (a > 0 && a < 1) {
    result.onLine1 = true;
  }
  // if line2 is a segment and line1 is infinite, they intersect if:
  if (b > 0 && b < 1) {
    result.onLine2 = true;
  }
  // if line1 and line2 are segments, they intersect if both of the above are true
  return result;
}

/**
 * transforms coordinate with intersection from corner
 * @param {Array<ol.Coordinate>} inputOrigin
 * @param {Array<ol.Coordinate>} inputTarget
 * @param {boolean} originIsImage
 * @param {ol.Coordinate} coordinate2Transform
 * @param {vcs.oblique.ViewDirection} viewDirection
 * @return {{x: (number|null), y:(number|null), onLine1: boolean, onLine2: boolean}|null}
 */
export function transformCWIFC(inputOrigin, inputTarget, originIsImage, coordinate2Transform, viewDirection) {
  const origin = sortRealWordEdgeCoordinates(inputOrigin, originIsImage ? false : viewDirection);
  const target = sortRealWordEdgeCoordinates(inputTarget, originIsImage ? viewDirection : false);

  // test intersections from all corner points over coordinate to all non neighbouring borders
  // and non side borders too - so actually remains only upper and lower border
  // and store:
  // - from which corner point,
  // - intersection,
  // - angle of intersection
  // - as well as edge (ccw) and
  // - distance ratio while negative means negative direction
  // to be able to recreate the situation in the target system
  const intersections = [];
  for (let cp = 0; cp < origin.length; ++cp) { // TODO write into a proper map and function
    const intrCurrCP = [];

    for (let sp = 0; sp < origin.length; ++sp) {
      const ep = sp === origin.length - 1 ? 0 : sp + 1; // end point of edge

      // skip if cp is sp or ep - neighbouring edge
      if (cp === sp || cp === ep) { continue; }

      // skip also if sp is 3 and ep is 0 and also skip sp is 1 and ep is 2 since does only work over the upper and lower boundary
      if ((sp === 3 && ep === 0) || (sp === 1 && ep === 2)) { continue; }

      // get intersection from cp over coordinate2Transform to current border edge
      const currIntr = checkLineIntersection([origin[cp], coordinate2Transform], [origin[sp], origin[ep]]);
      if (currIntr.x == null || currIntr.y == null) { continue; }

      // get vector from current cp to coordinate2Transform to be able to determine if the intersection is in same direction
      // might be in different direction when point is outside - then we dont need this data
      const vectorCP2Coordinate = [coordinate2Transform[0] - origin[cp][0], coordinate2Transform[1] - origin[cp][1]];
      const vectorCP2Intr = [currIntr.x - origin[cp][0], currIntr.y - origin[cp][1]];
      const angleDirectionCheck = angleBetweenTwo2DVectors(vectorCP2Coordinate, vectorCP2Intr);
      if (angleDirectionCheck == null) { continue; }

      if (angleDirectionCheck / (Math.PI * 180.0) > 5) { continue; }

      const sp2ep = [origin[sp][0] - origin[ep][0], origin[sp][1] - origin[ep][1]];
      const ep2sp = [origin[ep][0] - origin[sp][0], origin[ep][1] - origin[sp][1]];
      // regarding the angle find the smallest
      const angleStart2End = angleBetweenTwo2DVectors(vectorCP2Coordinate, sp2ep);
      if (angleStart2End == null) { continue; }

      const angleEnd2Start = angleBetweenTwo2DVectors(vectorCP2Coordinate, ep2sp);
      if (angleEnd2Start == null) { continue; }

      // regarding ratioStart2End get ratio and then direction
      const distStartEnd = cartesian2DDistance(origin[sp], origin[ep]);
      if (distStartEnd === 0) { continue; }
      const tempRatioStartEnd = cartesian2DDistance(origin[sp], [currIntr.x, currIntr.y]) / distStartEnd;
      let angleEdge2Intr = 0;
      if (tempRatioStartEnd !== 0) {
        angleEdge2Intr = angleBetweenTwo2DVectors(ep2sp, [currIntr.x - origin[sp][0], currIntr.y - origin[sp][1]]);
        if (angleEdge2Intr == null) { continue; }
      }

      intrCurrCP.push({
        cornerPoint: cp,
        intrX: currIntr.x,
        intrY: currIntr.y,
        angle: angleStart2End <= angleEnd2Start ? angleStart2End : angleEnd2Start,
        edgeStart: sp,
        edgeEnd: ep,
        ratioStart2End: (angleEdge2Intr / Math.PI) * 180.0 > 5 ? tempRatioStartEnd * (-1) : tempRatioStartEnd,
      });
    }

    // after getting the data find the intersection with largest of smallest angles
    let largestAngle = -1;
    let indLargestAngle = -1;
    for (let i = 0; i < intrCurrCP.length; ++i) {
      if (intrCurrCP[i].angle > largestAngle) {
        largestAngle = intrCurrCP[i].angle;
        indLargestAngle = i;
      }
    }
    if (indLargestAngle !== -1) { intersections.push(intrCurrCP[indLargestAngle]); }
  }

  // if we don not have enough data to recreate the situation in target system stop
  if (intersections.length < 2) { return null; }

  // make list with intersection combinations and sort after strength (add angles together)
  const intrCombis = []; // will contain [addedAngle, intersectionsIndex_i, intersectionsIndex_j]
  for (let i = 0; i < intersections.length; ++i) {
    for (let j = i + 1; j < intersections.length; ++j) {
      intrCombis.push([intersections[i].angle + intersections[j].angle, i, j]);
    }
  }

  let intrCross = null;
  intrCombis
    .sort()
    .reverse()
    .find((intersection) => {
      const intersectionsSorted = [intersections[intersection[1]], intersections[intersection[2]]];

      const targetEdgeEnd0 = target[intersectionsSorted[0].edgeEnd];
      const targetEdgeStart0 = target[intersectionsSorted[0].edgeStart];
      // test angle of lines with that the intersection will be calculated - if two small skip
      const targetEdgeVectorFor0 = [
        targetEdgeEnd0[0] - targetEdgeStart0[0],
        targetEdgeEnd0[1] - targetEdgeStart0[1],
      ];

      const intrFor0InTarget = [
        targetEdgeStart0[0] + (targetEdgeVectorFor0[0] * intersectionsSorted[0].ratioStart2End),
        targetEdgeStart0[1] + (targetEdgeVectorFor0[1] * intersectionsSorted[0].ratioStart2End),
      ];

      const targetEdgeEnd1 = target[intersectionsSorted[1].edgeEnd];
      const targetEdgeStart1 = target[intersectionsSorted[1].edgeStart];

      const targetEdgeVectorFor1 = [targetEdgeEnd1[0] - targetEdgeStart1[0], targetEdgeEnd1[1] - targetEdgeStart1[1]];
      const intrFor1InTarget = [
        targetEdgeStart1[0] + (targetEdgeVectorFor1[0] * intersectionsSorted[1].ratioStart2End),
        targetEdgeStart1[1] + (targetEdgeVectorFor1[1] * intersectionsSorted[1].ratioStart2End),
      ];

      const vecCP0ToIntr0 = [
        intrFor0InTarget[0] - target[intersectionsSorted[0].cornerPoint][0],
        intrFor0InTarget[1] - target[intersectionsSorted[0].cornerPoint][1],
      ];
      const vecCP1ToIntr1 = [
        intrFor1InTarget[0] - target[intersectionsSorted[1].cornerPoint][0],
        intrFor1InTarget[1] - target[intersectionsSorted[1].cornerPoint][1],
      ];

      const angleCross = angleBetweenTwo2DVectors(vecCP0ToIntr0, vecCP1ToIntr1);
      if (angleCross == null) { return false; }
      /* var thresholdInDegree = 3;
       if (angleCross/Math.PI*180.0 < thresholdInDegree || angleCross/Math.PI*180.0 > 180-thresholdInDegree)
       continue; */

      // get point in target
      intrCross = checkLineIntersection(
        [target[intersectionsSorted[0].cornerPoint], intrFor0InTarget],
        [target[intersectionsSorted[1].cornerPoint], intrFor1InTarget],
      );
      if (intrCross.x == null || intrCross.y == null) {
        return false;
      }

      return true;
    });

  return intrCross;
}

/**
 * changes input coordinate Array in place, new height can also be accessed by coordinates[x][2]
 * @param {Cesium.CesiumTerrainProvider} terrainProvider
 * @param {Array<ol.Coordinate>} coordinates
 * @param {ol.proj.Projection=} optSourceProjection - if input is not WGS84
 * @return {Promise<Array<ol.Coordinate>>}
 */
export function getHeightFromTerrainProvider(terrainProvider, coordinates, optSourceProjection) {
  const wgs84 = getProjection('EPSG:4326');
  const sourceTransformer = optSourceProjection ? getTransform(optSourceProjection, wgs84) : null;

  const positions = coordinates.map((coord) => {
    const transformedCoordinates = sourceTransformer ? sourceTransformer(coord) : coord;
    return Cesium.Cartographic.fromDegrees(transformedCoordinates[0], transformedCoordinates[1]);
  });

  return new Promise((resolve, reject) => {
    Cesium.sampleTerrainMostDetailed(terrainProvider, positions)
      .then((updatedPositions) => {
        updatedPositions.forEach((position, index) => {
          coordinates[index][2] = position.height;
        });
        resolve(coordinates);
      }, reject);
  });
}

/**
 * @typedef {Object} vcs.oblique.TransformationOptions
 * @property {boolean|undefined} dontUseTerrain
 * @property {ol.proj.Projection|undefined} dataProjection - the projection of the input/output coordinates, assumes image source projection
 * @property {number|undefined} [terrainErrorThreshold=1] - the transformToWorld process iterativly calculates a new Height Value from the terrainProvider until the difference to the new height value is smaller
 * @property {number|undefined} [terrainErrorCountThreshold=3] - how often the  transformToWorld process iterativly calculates a new Height Value from the terrainProvider
 */

/**
 * Always returns a Promise. When the input coordinates contain a height, it will use this height to compute the image coordinates
 * When not, it will try to get the terrainHeight in case a terrain is defined and use the height from there, to compute the image coordinates
 * @param {vcs.oblique.Image} image
 * @param {ol.Coordinate} worldCoordinate if not in image sourceProjection specify data-projection in options
 * @param {vcs.oblique.TransformationOptions=} options
 * @returns {Promise<{coords: ol.Coordinate, height: number, estimate: (boolean|undefined)}>}
 */
export function transformToImage(image, worldCoordinate, options = {}) {
  const gpInternalCoordinates = options.dataProjection ?
    getTransform(worldCoordinate, options.dataProjection, image.projection) :
    worldCoordinate;
  function useAverageHeight() {
    const coords = image.transformRealWorld2Image(gpInternalCoordinates);
    return { coords, height: image.averageHeight, estimate: true };
  }

  if (worldCoordinate[2]) {
    const coords = image.transformRealWorld2Image(gpInternalCoordinates, worldCoordinate[2]);
    return Promise.resolve({ coords, height: worldCoordinate[2], estimate: false });
  }

  if (!options.dontUseTerrain && image.terrainProvider) {
    return getHeightFromTerrainProvider(image.terrainProvider, [gpInternalCoordinates], image.projection)
      .then(() => {
        if (gpInternalCoordinates[2]) {
          const imageCoordinates = image.transformRealWorld2Image(gpInternalCoordinates, gpInternalCoordinates[2]);
          return { coords: imageCoordinates, height: gpInternalCoordinates[2], estimate: false };
        }
        this.logger.warning('The configured terrain on the oblique layer could not be queried, position might be inaccurate');
        return useAverageHeight();
      })
      .catch(() => useAverageHeight());
  }
  return Promise.resolve(useAverageHeight());
}

/**
 * Always returns a deferred.
 * it will try to get the terrainHeight in case a terrain is defined.
 * @param {vcs.oblique.Image} image
 * @param {ol.Coordinate} imageCoordinate
 * @param {vcs.oblique.TransformationOptions=} options
 * @returns {Promise<{coords: ol.Coordinate, estimate: (boolean|undefined)}>} return coordinates are in WGS84 if not specified in options
 */
export function transformFromImage(image, imageCoordinate, options = {}) {
  const wgs84Projection = getProjection('EPSG:4326');
  const initialWorldCoords = transform(
    image.transformImage2RealWorld(imageCoordinate, image.averageHeight),
    image.projection,
    wgs84Projection,
  );

  const terrainErrorThreshold = options.terrainErrorThreshold || 1;
  const terrainErrorCountThreshold = options.terrainErrorCountThreshold || 3;
  let count = 0;
  function pickTerrain(worldCoords, height) {
    count += 1;
    return getHeightFromTerrainProvider(image.terrainProvider, [worldCoords])
      .then(() => {
        if (worldCoords[2] != null) {
          const newWorldCoords = transform(
            image.transformImage2RealWorld(imageCoordinate, worldCoords[2]),
            image.projection,
            wgs84Projection,
          );
          newWorldCoords[2] = worldCoords[2];
          if (
            Math.abs(height - worldCoords[2]) < terrainErrorThreshold ||
            (count > terrainErrorCountThreshold)
          ) {
            return { coords: newWorldCoords, estimate: false };
          }
          return pickTerrain(newWorldCoords, worldCoords[2]);
        }
        console.log('The configured terrain on the oblique layer could not be queried, position might be inaccurate');
        return { coords: worldCoords, estimate: true };
      })
      .catch(() => ({ coords: worldCoords, estimate: true }));
  }

  const promise = !options.dontUseTerrain && image.terrainProvider ?
    pickTerrain(initialWorldCoords, image.getAverageHeight()) :
    Promise.resolve({ coords: initialWorldCoords, estimate: true });

  return promise
    .then((coordsObj) => {
      coordsObj.coords = options.dataProjection ?
        transform(coordsObj.coords, wgs84Projection, options.dataProjection) :
        transform(coordsObj.coords, wgs84Projection, image.projection);
      return coordsObj;
    });
}

