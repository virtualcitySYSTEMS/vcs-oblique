/* eslint-disable no-console */
import uuidv4 from 'uuid/v4';
import { transformCWIFC, getHeightFromTerrainProvider } from './helpers';

/**
 * @typedef {Object} vcs.oblique.Image.Options
 * @property {!string} name
 * @property {vcs.oblique.ViewDirection} viewDirection
 * @property {number} viewDirectionAngle
 * @property {!Array<ol.Coordinate>} groundCoordinates
 * @property {!ol.Coordinate} centerPointOnGround
 * @property {!vcs.oblique.ImageMeta} meta
 * @property {vcs.oblique.Camera|undefined} camera
 * @property {Cesium.Cartesian3|undefined} projectionCenter
 * @property {Cesium.Matrix3|undefined} pToRealworld
 * @property {Cesium.Matrix4|undefined} pToImage
 * @property {ol.proj.Projection} projection
 * @property {Cesium.CesiumTerrainProvider=} terrainProvider
 * @api
 */

/**
 * @constructor
 * @memberOf vcs.oblique
 * @api
 */
class Image {
  /**
   * @param {vcs.oblique.Image.Options} options
   */
  constructor(options) {
    /**
     * internal ID
     * @type {string}
     */
    this.id = uuidv4();

    /**
     * Name of the image
     * @type {string}
     * @api
     */
    this.name = options.name;

    /**
     * @type {vcs.oblique.ImageMeta}
     * @api
     */
    this.meta = options.meta;

    /**
     * viewDirection
     * @type {vcs.oblique.ViewDirection}
     * @api
     */
    this.viewDirection = options.viewDirection;

    /**
     * viewDirectionAngle
     * @type {number|null}
     * @api
     */
    this.viewDirectionAngle =
      options.viewDirectionAngle != null &&
      this.meta.version >= 3.4 &&
      this.meta.buildNumber >= 18 ?
        options.viewDirectionAngle : null;

    /** @type {vcs.oblique.Camera|undefined} */
    this.camera = options.camera;

    /** @type {Array<ol.Coordinate>} */
    this.groundCoordinates = options.groundCoordinates;

    /** @type {ol.Coordinate} */
    this.centerPointOnGround = options.centerPointOnGround;

    /** @type {?Cesium.Matrix3} */
    this.pToRealworld = options.pToRealworld || null;

    /** @type {?Cesium.Matrix4} */
    this.pToImage = options.pToImage || null;

    /** @type {?Cesium.Cartesian3} */
    this.projectionCenter = options.projectionCenter || null;

    /** @type {ol.proj.Projection} */
    this.projection = options.projection;

    /** @type {?number} */
    this.averageHeight = null;

    /** @type {Cesium.CesiumTerrainProvider|null} */
    this.terrainProvider = options.terrainProvider || null;
  }

  /**
   * @type {ol.Size}
   */
  get size() {
    return this.camera && this.camera.size ? this.camera.size : this.meta.size;
  }

  /**
   * @type {vcs.oblique.OLView}
   */
  get view() {
    return this.camera && this.camera.view ? this.camera.view : this.meta.getView(this.viewDirection);
  }

  /**
   * returns the averageHeight of the image
   * @return {number}
   */
  getAverageHeight() {
    return this.averageHeight != null ? this.averageHeight : 0;
  }

  /**
   * @param {ol.Coordinate} imageCoordinate
   * @param {number=} optAvgHeight
   * @return {ol.Coordinate}
   */
  transformImage2RealWorld(imageCoordinate, optAvgHeight) {
    let distortedCoordinate = imageCoordinate;
    if (!this.camera) {
      return this.transformNoCamera(distortedCoordinate, true, optAvgHeight);
    } else if (this.camera.hasRadial) {
      distortedCoordinate = this.camera.radialDistortionCoordinate(distortedCoordinate, true);
    }

    const x = new Cesium.Cartesian3(distortedCoordinate[0], this.size[1] - distortedCoordinate[1], 1);
    const rayWorld = Cesium.Matrix3.multiplyByVector(this.pToRealworld, x, new Cesium.Cartesian3());
    const avgHeight = optAvgHeight || this.getAverageHeight();
    const centerPointOnGround =
      new Cesium.Cartesian3(this.centerPointOnGround[0], this.centerPointOnGround[1], avgHeight);
    const w0 = Cesium.Cartesian3.subtract(this.projectionCenter, centerPointOnGround, new Cesium.Cartesian3());
    const a = Cesium.Cartesian3.dot(Cesium.Cartesian3.UNIT_Z, w0) * (-1);
    const b = Cesium.Cartesian3.dot(Cesium.Cartesian3.UNIT_Z, rayWorld);

    const r = a / b;

    const intr = Cesium.Cartesian3.add(
      this.projectionCenter,
      Cesium.Cartesian3.multiplyByScalar(rayWorld, r, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    return [intr.x, intr.y, avgHeight];
  }

  /**
   * @param {ol.Coordinate} worldCoordinate
   * @param {number=} optAvgHeight
   * @return {ol.Coordinate}
   */
  transformRealWorld2Image(worldCoordinate, optAvgHeight) {
    // if we dont have camera parameters
    if (!this.camera) {
      return this.transformNoCamera(worldCoordinate, false, optAvgHeight);
    }

    // usage of perspective projection
    // the averaged height is used for projection so far
    const avgHeight = optAvgHeight || this.getAverageHeight();

    const P = new Cesium.Cartesian4(worldCoordinate[0], worldCoordinate[1], avgHeight, 1);

    const camSys = Cesium.Matrix4.multiplyByVector(this.pToImage, P, new Cesium.Cartesian4());
    const respectiveImageCoords = [camSys.x / camSys.z, camSys.y / camSys.z];
    // adjust to ol image coordinates
    const imCoords = [respectiveImageCoords[0], this.size[1] - respectiveImageCoords[1]];

    return this.camera.radialDistortionCoordinate(imCoords, false);
  }


  /**
   * @param {ol.Coordinate} coord
   * @param {boolean} isImage
   * @param {number=} optAvgHeight
   * @return {ol.Coordinate}
   */
  transformNoCamera(coord, isImage, optAvgHeight) {
    const imageCoords = [[0, 0], [this.size[0], 0], this.size, [0, this.size[1]]];
    const intrCross = transformCWIFC(
      isImage ? imageCoords : this.groundCoordinates,
      isImage ? this.groundCoordinates : imageCoords,
      isImage,
      coord,
      this.viewDirection,
    );
    const height = optAvgHeight || this.getAverageHeight();
    // if intersection could not be determined write error and return center
    if (intrCross === null || intrCross.x == null || intrCross.y == null) {
      console.error('Real world coordinate could not be determined from footprint data, center will be returned');
      const coords = [this.centerPointOnGround[0], this.centerPointOnGround[1]];
      if (isImage) {
        coords.push(height);
      }
      return coords;
    }
    const coords = [intrCross.x, intrCross.y];
    if (isImage) {
      coords.push(height);
    }
    return coords;
  }

  /**
   * calculates the averageHeight of this image, if a terrainProvider is given the height will be requested
   * @return {Promise}
   */
  calculateImageAverageHeight() {
    if (this.averageHeight === null) {
      const averageHeight = (
        this.groundCoordinates[0][2] +
        this.groundCoordinates[1][2] +
        this.groundCoordinates[2][2] +
        this.groundCoordinates[3][2]) / 4;
      if (averageHeight === 0 && this.terrainProvider) {
        return getHeightFromTerrainProvider(
          this.terrainProvider,
          [this.centerPointOnGround.slice()],
          this.projection,
        )
          .then((coords) => {
            if (coords[0] && coords[0][2] != null) {
              this.averageHeight = coords[0][2];
            }
          }).catch(() => {
            this.averageHeight = averageHeight;
          });
      }
      this.averageHeight = averageHeight;
    }
    return Promise.resolve();
  }
}

export default Image;
