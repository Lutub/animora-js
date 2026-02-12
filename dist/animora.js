(function (global) {

  const Animora = (() => {

    const animations = [];
    let running = false;
    const positionStore = new WeakMap();

    // Helpers
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = t => Math.max(0, Math.min(1, t));
    const spring = t => 1 - Math.cos(t * 4.5 * Math.PI) * Math.exp(-6 * t);

    const easings = {
      linear: t => t,
      easeOutCubic: t => 1 - Math.pow(1 - t, 3),
      easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
      spring
    };

    const tick = time => {
      for (let i = animations.length - 1; i >= 0; i--) {
        const anim = animations[i];
        anim.update(time);
        if (anim.done) animations.splice(i, 1);
      }
      if (animations.length > 0) requestAnimationFrame(tick);
      else running = false;
    };

    const addAnimation = anim => {
      animations.push(anim);
      if (!running) {
        running = true;
        requestAnimationFrame(tick);
      }
    };

    const parseColor = color => {
      if (!color) return null;
      const div = document.createElement('div');
      div.style.color = color;
      document.body.appendChild(div);
      const cs = getComputedStyle(div).color;
      document.body.removeChild(div);
      const m = cs.match(/rgba?\((\d+), (\d+), (\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    };

    const lerpColor = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));

    const getBaseTransform = el => positionStore.get(el) || { x: 0, y: 0, z: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0 };

    const applyTransform = (el, t) => {
      el.style.transform = `translate3d(${t.x}px,${t.y}px,${t.z}px) scale(${t.scale}) rotate(${t.rotate}deg) skew(${t.skewX}deg,${t.skewY}deg)`;
    };

    const animate = (target, options = {}) => {
      const elements = typeof target === 'string' ? document.querySelectorAll(target) : [target];

      elements.forEach(el => {

        let {
          x = 0, y = 0, z = 0, scale = 1, rotate = 0, skewX = 0, skewY = 0,
          opacity, duration = 1000, delay = 0, ease = 'easeOutCubic',
          keyframes, backgroundColor, color, repeat = 0, yoyo = false,
          savePos = false, onComplete, onUpdate
        } = options;

        const base = getBaseTransform(el);

        // If savePos, build target relative to last position
        const startValues = { ...base };
        let targetValues;

        if (!keyframes) {
          targetValues = {
            x: base.x + x,
            y: base.y + y,
            z: base.z + z,
            scale: base.scale * scale,
            rotate: base.rotate + rotate,
            skewX: base.skewX + skewX,
            skewY: base.skewY + skewY
          };
        }

        const initialOpacity = opacity !== undefined ? parseFloat(getComputedStyle(el).opacity) : undefined;
        const initialBgColor = backgroundColor ? parseColor(getComputedStyle(el).backgroundColor) : undefined;
        const initialColor = color ? parseColor(getComputedStyle(el).color) : undefined;

        const startTime = performance.now() + delay;
        let cycles = 0;

        addAnimation({
          done: false,
          update(time) {
            if (time < startTime) return;

            let progress = clamp((time - startTime) / duration);
            let eased = easings[ease] ? easings[ease](progress) : progress;

            // Keyframes
            if (keyframes) {
              const frameKeys = Object.keys(keyframes).map(k => parseFloat(k)).sort((a, b) => a - b);
              for (let i = 0; i < frameKeys.length - 1; i++) {
                const f0 = frameKeys[i], f1 = frameKeys[i + 1];
                if (progress >= f0 && progress <= f1) {
                  const localT = (progress - f0) / (f1 - f0);
                  const frame0 = keyframes[f0], frame1 = keyframes[f1];

                  el.style.transform = `
                    translate3d(${lerp(frame0.x || 0, frame1.x || 0, localT)}px,
                                ${lerp(frame0.y || 0, frame1.y || 0, localT)}px,
                                ${lerp(frame0.z || 0, frame1.z || 0, localT)}px)
                    scale(${lerp(frame0.scale || 1, frame1.scale || 1, localT)})
                    rotate(${lerp(frame0.rotate || 0, frame1.rotate || 0, localT)}deg)
                    skew(${lerp(frame0.skewX || 0, frame1.skewX || 0, localT)}deg,
                         ${lerp(frame0.skewY || 0, frame1.skewY || 0, localT)}deg)
                  `;

                  if (frame0.opacity !== undefined) el.style.opacity = lerp(frame0.opacity, frame1.opacity, localT);
                }
              }
            } else {
              // normal animation
              const current = {
                x: lerp(startValues.x, targetValues.x, eased),
                y: lerp(startValues.y, targetValues.y, eased),
                z: lerp(startValues.z, targetValues.z, eased),
                scale: lerp(startValues.scale, targetValues.scale, eased),
                rotate: lerp(startValues.rotate, targetValues.rotate, eased),
                skewX: lerp(startValues.skewX, targetValues.skewX, eased),
                skewY: lerp(startValues.skewY, targetValues.skewY, eased)
              };

              applyTransform(el, current);

              if (opacity !== undefined && initialOpacity !== undefined)
                el.style.opacity = lerp(initialOpacity, opacity, eased);

              if (backgroundColor && initialBgColor) {
                const c = lerpColor(initialBgColor, parseColor(backgroundColor), eased);
                el.style.backgroundColor = `rgb(${c.join(',')})`;
              }

              if (color && initialColor) {
                const c = lerpColor(initialColor, parseColor(color), eased);
                el.style.color = `rgb(${c.join(',')})`;
              }
            }

            if (onUpdate) onUpdate(eased);

            // Check complete
            if (progress >= 1) {
              if (cycles < repeat) {
                cycles++;
                if (yoyo) {
                  if (keyframes) {
                    // swap frames for yoyo
                    // optional: implement if needed
                  } else {
                    [startValues.x, targetValues.x] = [targetValues.x, startValues.x];
                    [startValues.y, targetValues.y] = [targetValues.y, startValues.y];
                    [startValues.z, targetValues.z] = [targetValues.z, startValues.z];
                    [startValues.scale, targetValues.scale] = [targetValues.scale, startValues.scale];
                    [startValues.rotate, targetValues.rotate] = [targetValues.rotate, startValues.rotate];
                    [startValues.skewX, targetValues.skewX] = [targetValues.skewX, startValues.skewX];
                    [startValues.skewY, targetValues.skewY] = [targetValues.skewY, startValues.skewY];
                  }
                }
                this.startTime = performance.now();
                return;
              }

              if (savePos && !keyframes) positionStore.set(el, targetValues);

              this.done = true;
              if (onComplete) onComplete();
            }
          }
        });

      });

    };

    const stagger = (selector, options, config = {}) => {
      const elements = document.querySelectorAll(selector);
      const each = config.each || 100;
      elements.forEach((el, i) => {
        animate(el, { ...options, delay: (options.delay || 0) + i * each });
      });
    };

    const timeline = () => {
      const steps = [];
      let totalDelay = 0;
      return {
        to(selector, options) { steps.push(() => animate(selector, { ...options, delay: totalDelay })); totalDelay += options.duration || 1000; return this; },
        from(selector, options) {
          const els = document.querySelectorAll(selector);
          els.forEach(el => {
            if (options.scale !== undefined) el.style.transform = `scale(${options.scale})`;
            if (options.opacity !== undefined) el.style.opacity = options.opacity;
          });
          return this.to(selector, options);
        },
        add(fn, offset = 0) { steps.push(() => fn(offset)); return this; },
        play() { steps.forEach(s => s()); }
      };
    };

    const scrollTrigger = (selector, options = {}) => {
      const els = document.querySelectorAll(selector);
      const offset = options.offset || 0.8;
      const once = options.once ?? true;
      const callback = () => {
        const triggerPoint = window.innerHeight * offset;
        els.forEach(el => {
          if (el.dataset.vtrigger && once) return;
          const top = el.getBoundingClientRect().top;
          if (top < triggerPoint) {
            el.dataset.vtrigger = true;
            animate(el, options);
          }
        });
      };
      window.addEventListener('scroll', callback);
      window.addEventListener('resize', callback);
      callback();
    };

    const showRaster = (size = 50) => {
      let grid = document.getElementById("volt-grid");
      if (grid) {
        grid.remove();
        return;
      }
      grid = document.createElement("div");
      grid.id = "volt-grid";
      grid.style.position = "fixed";
      grid.style.inset = "0";
      grid.style.pointerEvents = "none";
      grid.style.zIndex = "9999";
      grid.style.backgroundImage = `
        linear-gradient(to right, rgba(0,0,0,.15) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,.15) 1px, transparent 1px)
      `;
      grid.style.backgroundSize = `${size}px ${size}px`;
      document.body.appendChild(grid);
    };

    return { animate, stagger, timeline, scrollTrigger, showRaster };

  })();

  global.Animora = Animora;

})(window);