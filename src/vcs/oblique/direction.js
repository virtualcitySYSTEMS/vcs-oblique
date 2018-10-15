/* eslint-disable no-console */
import rbush from 'rbush';
import knn from 'rbush-knn';
import { transformFromImage } from './helpers';

/**
 * @typedef {Object} vcs.oblique.Direction.Options
 * @property {Array<vcs.oblique.RTreeEntry>} rTreeItems
 * @property {Array<ol.Feature>} footPrintFeatures
 * @property {vcs.oblique.ViewDirection} direction
 * @property {Object<string, vcs.oblique.Image>} images
 * @property {ol.proj.Projection} projection
 * @property {Cesium.CesiumTerrainProvider|undefined} terrainProvider
 */

/**
 * @typedef {Object} vcs.oblique.RTreeEntry
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 * @property {string} name
 */


/**
 * @enum {number}
 * @memberOf vcs.oblique.Direction
 * @property {number} LOADING
 * @property {number} INACTIVE
 * @property {number} ACTIVE
 */
const STATE = {
  LOADING: -1,
  INACTIVE: 0,
  ACTIVE: 1,
};

/**
 * @constructor
 * @memberOf vcs.oblique
 * @api
 */
class Direction {
  /**
   * @type {{LOADING: number, INACTIVE: number, ACTIVE: number}}
   */
  static get STATE() { return STATE; }

  /**
   * @param {vcs.oblique.Direction.Options} options
   */
  constructor(options) {
    /** @type {?vcs.oblique.Image} */
    this.currentImage = null;

    /** @type {?vcs.oblique.OLView} */
    this.currentView = null;

    const source = new ol.source.Vector({
      features: options.footPrintFeatures,
    });
    /** @type {?ol.layer.Vector} */
    this.footPrintsLayer = new ol.layer.Vector({ source });

    /** @type {rbush} */
    this.rTree = rbush();
    this.rTree.load(options.rTreeItems);

    /** @type {?ol.Map} */
    this.olMap = null;

    /** @type {vcs.oblique.OLView|null} */
    this.currentView = null;
    /** @type {vcs.oblique.Image|null} */
    this.currentImage = null;

    /** @type {vcs.oblique.Direction.STATE} */
    this.state = STATE.INACTIVE;
    /** @type {Object<string, vcs.oblique.Image>} */
    this.images = options.images || {};

    /** @type {ol.proj.Projection} */
    this.projection = options.projection;

    /** @type {?Cesium.CesiumTerrainProvider} */
    this.terrainProvider = options.terrainProvider || null;

    /** @type {vcs.oblique.ViewDirection} */
    this.direction = options.direction;
  }

  /**
   * @param {ol.Map} olMap
   * @param {ol.Coordinate=} coordinate
   * @param {number=} zoom
   * @return {Promise}
   */
  activate(olMap, coordinate, zoom) {
    if (this.state === STATE.INACTIVE) {
      this.state = STATE.LOADING;
      this.olMap = olMap;
      return this.setView(coordinate, zoom).then(() => {
        this.state = STATE.ACTIVE;
      });
    }
    return Promise.resolve(this.state);
  }

  deactivate() {
    if (this.currentView) {
      this.olMap.removeLayer(this.currentView.layer);
      this.currentView = null;
    }
    this.currentImage = null;
    this.state = STATE.INACTIVE;
  }

  /**
   * @param {ol.Coordinate} coordinate
   * @param {number} zoom
   * @return {Promise}
   */
  setView(coordinate, zoom) {
    const imageName = this.getImageNameForCoordinates(coordinate);
    if (imageName !== null) {
      return this.setImageOnMap(imageName).then(() => {
        const { view } = this.currentView;
        view.setZoom(zoom);
      });
    }
    return Promise.reject(new Error('could not find an image in this direction'));
  }

  /**
   * @param {vcs.oblique.Direction.Options} options
   */
  addOptions(options) {
    this.footPrintsLayer.getSource().addFeatures(options.footPrintFeatures);
    this.rTree.load(options.rTreeItems);
    Object.assign(this.images, options.images);
  }

  /**
   * @param {ol.Coordinate} coord - image coordinates
   */
  postRenderHandler(coord) {
    if (this.state === STATE.ACTIVE) {
      const currViewCenter = this.currentImage.transformImage2RealWorld(coord);
      const newImageName = this.getImageNameForCoordinates(currViewCenter);

      if (newImageName !== null && newImageName !== this.currentImage.name) {
        this.state = STATE.LOADING;
        transformFromImage(this.currentImage, coord)
          .then(newCurrViewCenter => this.setImageOnMap(newImageName, newCurrViewCenter.coords))
          .catch(() => {
            console.warn(`an error occured while setting image ${newImageName} onto the map`);
            this.state = STATE.ACTIVE;
          });
      }
    }
  }

  /**
   * @param {string} name
   * @param {ol.Coordinate=} optCenter - center in layer source projection for image view to have after setting it on the map
   * @return {Promise}
   * @api
   */
  setImageOnMap(name, optCenter) {
    /**
     * @param {number} number
     * @param {number} max
     * @return {number}
     */
    function withinBounds(number, max) {
      if (number < 0) {
        return 0;
      }

      if (number > max) {
        return max;
      }
      return number;
    }

    this.state = Direction.STATE.LOADING;
    let newImagePromise = Promise.resolve();
    if (!this.currentImage || name !== this.currentImage.name) {
      const newImage = this.images[name];
      newImagePromise = newImage.calculateImageAverageHeight()
        .then(() => {
          this.currentImage = newImage;

          const { view } = this.currentImage;
          const addLayer = !this.currentView || (this.currentView && this.currentView.id !== view.id);
          if (this.currentView && this.currentView.id !== view.id) {
            this.olMap.removeLayer(this.currentView.layer);
          }

          this.currentView = view;
          this.currentView.setImageName(this.currentImage.name);

          if (this.olMap.getView() && this.olMap.getView().getResolution()) {
            this.currentView.view.setResolution(this.olMap.getView().getResolution());
          }

          this.olMap.setView(this.currentView.view);
          if (addLayer) {
            this.olMap.addLayer(this.currentView.layer);
          }
        });
    }
    return newImagePromise
      .then(() => {
        const [width, height] = this.currentImage.size;
        let center = [width / 2, height / 2];
        if (optCenter) {
          const imageCenter = this.currentImage.transformRealWorld2Image(optCenter, optCenter[2]);
          imageCenter[0] = withinBounds(imageCenter[0], width);
          imageCenter[1] = withinBounds(imageCenter[1], height);
          center = imageCenter;
        }
        this.currentView.view.setCenter(center);
        this.state = Direction.STATE.ACTIVE;
      });
  }

  /**
   * @param {number} direction - 0 = east, PI / 2 = north, PI = west and PI * 1.5 = south
   * @param {number=} [deviation=PI/4]
   * @return {string|null}
   * @api
   */
  getImageIdInDirection(direction, deviation = Math.PI / 4) {
    if (!this.currentImage) {
      return null;
    }
    const { centerPointOnGround } = this.currentImage;
    /** @type {Array} */
    const neighbors = knn(this.rTree, centerPointOnGround[0], centerPointOnGround[1], 20);
    const found = neighbors.find((neighbour) => {
      if (neighbour.name !== this.currentImage.name) {
        let angle = Math.atan2(neighbour.minY - centerPointOnGround[1], neighbour.minX - centerPointOnGround[0]);
        if (angle <= 0) {
          angle += Math.PI * 2;
        }
        let differenceAngle = angle - direction;
        if (differenceAngle > Math.PI) {
          differenceAngle -= (Math.PI * 2);
        } else if (differenceAngle < -Math.PI) {
          differenceAngle += (Math.PI * 2);
        }
        if (differenceAngle <= deviation && differenceAngle >= -deviation) {
          return neighbour;
        }
      }
      return false;
    });
    return found ? found.name : null;
  }

  /**
   * @param {ol.Coordinate} coords
   * @return {string|null}
   * @api
   */
  getImageNameForCoordinates(coords) {
    const neighbors = knn(this.rTree, coords[0], coords[1], 1);
    return neighbors.length ? neighbors[0].name : null;
  }
}


export default Direction;
