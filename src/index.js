import Collection from './vcs/oblique/collection';
import Camera from './vcs/oblique/camera';
import Direction from './vcs/oblique/direction';
import Image from './vcs/oblique/image';
import ImageMeta from './vcs/oblique/imageMeta';
import olView from './vcs/oblique/oLView';
import { ViewDirection, viewDirectionNames } from './vcs/oblique/viewDirection';


if (!window.vcs) {
  window.vcs = {};
}
if (!window.vcs.oblique) {
  window.vcs.oblique = {};
}

window.vcs.oblique.Collection = Collection;
window.vcs.oblique.Camera = Camera;
window.vcs.oblique.Direction = Direction;
window.vcs.oblique.Image = Image;
window.vcs.oblique.ImageMeta = ImageMeta;
window.vcs.oblique.olView = olView;
window.vcs.oblique.ViewDirection = ViewDirection;
window.vcs.oblique.viewDirectionNames = viewDirectionNames;
