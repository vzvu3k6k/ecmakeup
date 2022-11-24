import { Controller } from './controller';
import { Balloon } from './balloon';

const mountTarget = document.getElementById('ecmarkup');
if (mountTarget) {
  const balloon = new Balloon(mountTarget);

  const controller = new Controller({ balloon });
  controller.register(document);
  controller.balloon = balloon;
}
