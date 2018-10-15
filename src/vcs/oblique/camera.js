import { cartesian2DDistance } from './helpers';

/**
 * @typedef {Object} vcs.oblique.Camera.Options
 * @property {string} name
 * @property {!ol.Coordinate} principal-point
 * @property {ol.Coordinate|undefined} pixel-size
 * @property {Array<number>|undefined} radial-distorsion-expected-2-found
 * @property {Array<number>|undefined} radial-distorsion-found-2-expected
 * @property {ol.Size|undefined} size
 * @property {vcs.oblique.OLView|undefined} view
 * @api
 */


/**
 * @constructor
 * @memberOf vcs.oblique
 * @api
 */
class Camera {
  /**
   * @param {vcs.oblique.Camera.Options} options
   */
  constructor(options) {
    /** @type {string} */
    this.name = options.name;
    /** @type {ol.Coordinate} */
    this.principalPoint = options['principal-point'];
    /** @type {ol.Coordinate|undefined} */
    this.pixelSize = options['pixel-size'];
    /** @type {Array<number>|undefined} */
    this.radialE2F = options['radial-distorsion-expected-2-found'];
    /** @type {Array<number>|undefined} */
    this.radialF2E = options['radial-distorsion-found-2-expected'];
    /** @type {boolean} */
    this.hasRadial = !!(this.pixelSize && (this.radialE2F && this.radialF2E));
    /** @type {?ol.Size} */
    this.size = options.size || null;
    /** @type {?vcs.oblique.OLView} */
    this.view = options.view || null;
  }

  /**
   * @param {ol.Coordinate} coordinate
   * @param {boolean=} [useF2E=false] useFound2Expected, if not true expectedToFound is used
   * @return {ol.Coordinate}
   */
  radialDistortionCoordinate(coordinate, useF2E) {
    if (this.hasRadial) {
      const coefficientsArray = useF2E ? this.radialF2E : this.radialE2F;

      const distC2PPInMM = cartesian2DDistance(this.principalPoint, coordinate) * this.pixelSize[0];
      if (distC2PPInMM === 0) {
        return coordinate.slice();
      }
      const diffX = coordinate[0] - this.principalPoint[0];
      const diffY = coordinate[1] - this.principalPoint[1];

      // get shift value
      let shift = 0;
      for (let i = 0; i < coefficientsArray.length; ++i) {
        shift += coefficientsArray[i] * (distC2PPInMM ** i);
      }

      // get new position through spherical coordinates system - http://mathworld.wolfram.com/SphericalCoordinates.html
      const newDistInPixel = (distC2PPInMM + shift) / this.pixelSize[0];
      const angleTheta = Math.atan2(diffY, diffX);
      return [
        this.principalPoint[0] + (newDistInPixel * Math.cos(angleTheta)),
        this.principalPoint[1] + (newDistInPixel * Math.sin(angleTheta)),
      ];
    }

    return coordinate.slice();
  }
}

export default Camera;
