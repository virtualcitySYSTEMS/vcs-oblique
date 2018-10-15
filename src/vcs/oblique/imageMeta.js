import { ViewDirection } from './viewDirection';
/**
 * @typedef {Object} vcs.oblique.ImageMeta.Options
 * @property {ol.Size} size
 * @property {vcs.oblique.OLView} view
 * @property {number|null} version
 * @property {number|null} buildNumber
 * @api
 */

/**
 * @constructor
 * @memberOf vcs.oblique
 * @api
 */
class ImageMeta {
  /**
   * @param {vcs.oblique.ImageMeta.Options} options
   */
  constructor(options) {
    /** @type {ol.Size} */
    this.size = options.size;
    /** @type {Map<vcs.oblique.ViewDirection, vcs.oblique.OLView>} */
    this.views = new Map();
    if (options.view) {
      Object.values(ViewDirection).forEach((direction) => {
        this.views.set(direction, options.view.clone());
      });
    }
    /** @type {number} */
    this.version = options.version || 3.1;
    /** @type {number} */
    this.buildNumber = options.buildNumber || 0;
  }


  /**
   * @param {vcs.oblique.ViewDirection} direction
   * @return {vcs.oblique.OLView}
   */
  getView(direction) {
    return this.views.get(direction);
  }


  /**
   * @param {string} url
   * @param {ol.Size} size
   * @param {Array.<number>} tileResolution
   * @return {boolean}
   */
  isEqual(url, size, tileResolution) {
    if (this.size[0] !== size[0] || this.size[1] !== size[1]) {
      return false;
    }
    if (this.views.values().next().value.tileResolution.length !== tileResolution.length) {
      return false;
    }
    if (this.views.values().next().value.url !== url) {
      return false;
    }
    return true;
  }
}

export default ImageMeta;
