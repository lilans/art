(() => {
  'use strict';

  const assets = new URL('father-assets/', document.currentScript.src);

  // File pages block fetch and taint canvases drawn from sibling image files.
  // The local package supplies the same assets as data URLs for this entry point.
  function loadFileAssets() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('local-pack.js', assets).href;
      script.onload = () => {
        script.remove();
        if (script.fatherAssets) resolve(script.fatherAssets);
        else reject(new Error('Father local asset package is invalid'));
      };
      script.onerror = () => {
        script.remove();
        reject(new Error('Could not load Father asset package: ' + script.src));
      };
      document.head.append(script);
    });
  }

  async function loadManifest() {
    const response = await fetch(new URL('manifest.json', assets));
    if (!response.ok) throw new Error('Father asset manifest returned HTTP ' + response.status);
    return response.json();
  }

  function readPixels(item) {
    const surface = document.createElement('canvas');
    surface.width = item.width;
    surface.height = item.height;
    const ctx = surface.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(item, 0, 0);
    return ctx.getImageData(0, 0, item.width, item.height).data;
  }

  async function load() {
    const local = location.protocol === 'file:' ? await loadFileAssets() : null;
    const manifest = local ? local.manifest : await loadManifest();
    const imageCache = new Map();

    function image(file) {
      if (!imageCache.has(file)) {
        imageCache.set(file, (async () => {
          const source = local ? local.images[file] : new URL(file, assets).href;
          if (!source) throw new Error('Missing Father asset: ' + file);
          const item = new Image();
          item.src = source;
          await item.decode().catch(cause => {
            throw new Error('Could not decode Father asset: ' + file, {cause});
          });
          return item;
        })());
      }
      return imageCache.get(file);
    }

    async function loadLayers(specs) {
      return Object.fromEntries(await Promise.all(Object.entries(specs).map(async ([name, spec]) => {
        const [art, depth] = await Promise.all([image(spec.file), spec.depth && image(spec.depth)]);
        return [name, { ...spec, art, pixels: depth ? readPixels(depth) : null }];
      })));
    }

    async function loadImages(files, read = false) {
      return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, file]) => {
        const art = await image(file);
        return [name, read ? readPixels(art) : art];
      })));
    }

    const [variants, focus, depth, sprites, ending, overview] = await Promise.all([
      Promise.all(Object.entries(manifest.images).map(async ([state, specs]) => [state, await loadLayers(specs)])),
      loadLayers(manifest.focus),
      loadImages(manifest.depthImages, true),
      loadImages(manifest.sprites.images, true),
      loadImages(manifest.endings),
      image(manifest.overview)
    ]);

    return { manifest, painter: canvas => painter(canvas, manifest, Object.fromEntries(variants),
      focus, depth, sprites, ending, overview) };
  }

  function painter(canvas, data, variants, focus, depth, sprites, ending, overview) {
    const [width, height] = data.viewport;
    const [worldWidth, worldHeight] = data.atlas;
    const [origin, xAxis, yAxis, zAxis] = data.projection;
    const [depthX, depthY, depthZ, depthOffset, depthScale] = data.depth;
    const [spriteWidth, spriteHeight] = data.sprites.tile;
    const [footX, footY] = data.sprites.anchor;
    const spriteColumns = data.sprites.columns;
    const spriteStride = spriteWidth * spriteColumns;
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    const stamp = document.createElement('canvas');
    stamp.width = spriteWidth;
    stamp.height = spriteHeight;
    const stampContext = stamp.getContext('2d');
    const stampPixels = stampContext.createImageData(spriteWidth, spriteHeight);
    const output = stampPixels.data;
    const roomCenters = data.rooms.map((_, i) => {
      const cells = [];
      for (let y = 0; y < data.size[1]; y++) {
        for (let x = 0; x < data.size[0]; x++) {
          if (data.roomCells[y][x] === i + 1) cells.push([x * 8 + 4, y * 8 + 4]);
        }
      }
      return [0, 1].map(axis => cells.reduce((sum, cell) => sum + cell[axis], 0) / cells.length);
    });
    let cameraX, cameraY, activeLayer, sceneDepth, lighting, activeRoom;
    let cameraReady = false;
    let focusedOn = 0;
    let placed = [];
    let occluded = 0;
    let uncovered = 0;

    const vignette = c.createRadialGradient(width * .5, height * .52, height * .18,
      width * .5, height * .52, height * .77);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(.60, 'rgba(0,0,0,.08)');
    vignette.addColorStop(1, 'rgba(0,0,0,.36)');

    function project(x, y, z = 0) {
      return [origin[0] + x*xAxis[0] + y*yAxis[0] + z*zAxis[0],
        origin[1] + x*xAxis[1] + y*yAxis[1] + z*zAxis[1]];
    }

    function offset(x, y, z) {
      const [u, v] = project(x, y, z);
      return [Math.round(u) - cameraX, Math.round(v) - cameraY];
    }

    function backdrop(mode, elapsed, win) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, width, height);
      if (mode === 'intro') {
        const fit = Math.min(width / (worldWidth * .94), height / (worldHeight * .83));
        const w = Math.round(worldWidth * fit);
        const h = Math.round(worldHeight * fit);
        c.drawImage(overview, Math.round((width-w)/2), Math.round((height-h)/2), w, h);
        return;
      }
      if (!win) return;
      const name = elapsed < .48 ? 'stair-open'
        : elapsed < 1.83 ? 'stair-closed'
          : elapsed < 3.6 ? 'stair-empty' : elapsed >= 4.15 ? 'bed-still' : null;
      if (name) {
        c.globalAlpha = name === 'stair-empty' ? Math.min(1, (3.6 - elapsed) / .74)
          : name === 'bed-still' ? Math.min(1, (elapsed - 4.15) / .55) : 1;
        c.drawImage(ending[name], 0, 0);
        c.globalAlpha = 1;
      }
    }

    function placeCamera(player, room) {
      const [x, y] = project(player.x, player.y);
      const [u, v] = project(...roomCenters[room - 1]);
      const targetX = .61*x + .39*u - width/2;
      const targetY = .52*y + .48*v - height*.68;
      if (!cameraReady) {
        cameraX = Math.round(targetX);
        cameraY = Math.round(targetY);
        cameraReady = true;
      } else {
        const follow = (from, to) => Math.round(from + (to - from) * .20);
        cameraX = follow(cameraX, targetX);
        cameraY = follow(cameraY, targetY);
      }
    }

    function drawLayer(layer, brightness) {
      c.globalAlpha = brightness;
      c.drawImage(layer.art, layer.origin[0] - cameraX, layer.origin[1] - cameraY);
      c.globalAlpha = 1;
    }

    function occluderAt(x, y, z) {
      if (x < 0 || x >= worldWidth || y < 0 || y >= worldHeight) return false;
      const [fx, fy] = activeLayer.origin;
      const [fw, fh] = activeLayer.size;
      let pixels = activeLayer.pixels;
      let index = (x - fx + (y - fy) * fw) * 4;
      const inside = x >= fx && y >= fy && x < fx + fw && y < fy + fh && pixels[index + 3] > 127;
      if (!inside) {
        pixels = sceneDepth;
        index = (x + y * worldWidth) * 4;
        const room = Math.round(pixels[index] / 24);
        if (!room || room === activeRoom || lighting[room] < .19 || pixels[index + 3] < 128) return false;
      }
      const objectDepth = pixels[index + 1] * 256 + pixels[index + 2];
      return objectDepth > z;
    }

    function character(actor, role, pose, shade) {
      const direction = (Math.round(Math.atan2(actor.dir[1], actor.dir[0]) * 4 / Math.PI) + 8) % 8;
      const row = Math.max(0, data.sprites.rows[role].indexOf(pose));
      const [u, v] = project(actor.x, actor.y, .019);
      const x = Math.round(u) - footX, y = Math.round(v) - footY;
      const footDepth = (depthX*actor.x + depthY*actor.y) * data.metersPerUnit + depthOffset;
      const source = sprites[role];
      let painted = 0;
      for (let j = 0; j < spriteHeight; j++) {
        const headHeight = Math.max(0, (footY - j) / -zAxis[1]);
        const threshold = (footDepth + depthZ * headHeight + .075) * depthScale;
        for (let i = 0; i < spriteWidth; i++) {
          const s = ((row*spriteHeight + j)*spriteStride + direction*spriteWidth + i)*4;
          const n = (j*spriteWidth + i)*4;
          const alpha = source[s+3];
          const u = (i - footX - 3) / 15, v = (j - footY + 1) / 6;
          const shadow = Math.max(0, 1 - u*u - v*v) * 73;
          if ((!alpha && !shadow) || occluderAt(x + i, y + j, threshold)) {
            output[n+3] = 0;
            if (alpha > 90) occluded++;
            continue;
          }
          if (alpha) {
            output[n] = source[s] * shade;
            output[n+1] = source[s+1] * shade;
            output[n+2] = source[s+2] * shade;
            output[n+3] = alpha;
            if (alpha > 90) painted++;
          } else {
            output[n] = 10;
            output[n+1] = 9;
            output[n+2] = 9;
            output[n+3] = shadow;
          }
        }
      }
      stampContext.putImageData(stampPixels, 0, 0);
      c.drawImage(stamp, x - cameraX, y - cameraY);
      uncovered += painted;
      if (painted) placed.push(role);
    }

    function helper(world) {
      c.lineWidth = 1;
      c.strokeStyle = '#bcb09180';
      for (let y = 0; y < data.size[1]; y++) {
        for (let x = 0; x < data.size[0]; x++) {
          if (!world.blocked(x, y)) continue;
          c.beginPath();
          [[0,0],[8,0],[8,8],[0,8]].forEach(([i,j], index) => {
            const [u, v] = offset(x*8+i, y*8+j);
            if (index) c.lineTo(u,v);
            else c.moveTo(u,v);
          });
          c.closePath();
          c.stroke();
        }
      }
      c.strokeStyle = '#d4b37a';
      c.beginPath();
      c.moveTo(...offset(world.father.x, world.father.y));
      for (const step of world.father.route) c.lineTo(...offset(step.x, step.y));
      c.stroke();
      c.fillStyle = '#cec29b68';
      for (let y = 0; y < data.size[1]; y++) {
        for (let x = 0; x < data.size[0]; x++) {
          if (world.visible[y * data.size[0] + x]) {
            c.fillRect(...offset(x*8+4, y*8+4), 2, 2);
          }
        }
      }
    }

    function frame(world) {
      placed = [];
      occluded = uncovered = 0;
      if (world.mode === 'intro' || world.mode === 'ending' || world.mode === 'done') {
        backdrop(world.mode, world.ending, world.result);
        return;
      }
      activeRoom = world.room;
      placeCamera(world.player, activeRoom);
      c.fillStyle = '#030405';
      c.fillRect(0, 0, width, height);
      lighting = world.light;
      sceneDepth = depth[world.closed ? 'closed' : 'open'];
      const roomName = data.rooms[activeRoom - 1];
      const focusedVariant = roomName + (roomName === 'living' && world.tv ? '-tv'
        : world.closed && (roomName === 'bath' || roomName === 'hall') ? '-closed' : '');
      const cutaway = focus[focusedVariant];
      activeLayer = cutaway.pixels ? cutaway : focus[roomName];
      const current = variants[world.closed ? 'closed' : 'off'];
      const television = variants[world.closed ? 'closed-tv' : 'tv'];
      for (let i = 1; i <= data.rooms.length; i++) {
        if (i === activeRoom) continue;
        const name = data.rooms[i - 1];
        drawLayer(world.tv && i === 1 ? television[name] : current[name], lighting[i]);
      }
      drawLayer(cutaway, 1);
      focusedOn = activeRoom;

      if (world.keyMark) {
        const [a,b] = project(world.keyMark.x, world.keyMark.y, .036);
        const gx = Math.round(a), gy = Math.round(b);
        const z = (depthOffset+(world.keyMark.x*depthX+world.keyMark.y*depthY)*data.metersPerUnit+.07)*depthScale;
        if (!occluderAt(gx, gy, z)) {
          c.fillStyle = '#b3a070';
          c.fillRect(gx-cameraX-2, gy-cameraY, 5, 1);
          c.fillRect(gx-cameraX+1, gy-cameraY+1, 1, 2);
        }
      }
      const people = [{ actor: world.player, name: 'boy', pose: world.playerPose, shade: .88 }];
      if (world.fatherVisible) people.push({ actor: world.father, name: 'father', pose: world.fatherPose, shade: .78 });
      people.sort((a,b) => a.actor.x*depthX + a.actor.y*depthY - b.actor.x*depthX - b.actor.y*depthY);
      for (const { actor, name, pose, shade } of people) character(actor, name, pose, shade);

      c.fillStyle = vignette;
      c.fillRect(0, 0, width, height);
      if (world.fear > 30) {
        c.fillStyle = 'rgba(3,2,2,' + ((world.fear-30)*.0018) + ')';
        c.fillRect(0,0,width,height);
      }
      if (world.grid) helper(world);
    }

    return { frame, reset: () => { cameraReady = false; }, project,
      inspect: () => ({ placed: [...placed], occluded, uncovered, room: focusedOn, camera: [cameraX,cameraY] }) };
  }

  window.FatherArt = { load };
})();
