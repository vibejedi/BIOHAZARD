export function rayBox(origin, direction, low, high, maximum = 90) {
  let enter = 0, exit = maximum;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(direction[axis]) < 1e-9) { if (origin[axis] < low[axis] || origin[axis] > high[axis]) return null; continue; }
    let a = (low[axis] - origin[axis]) / direction[axis], b = (high[axis] - origin[axis]) / direction[axis];
    if (a > b) [a, b] = [b, a]; enter = Math.max(enter, a); exit = Math.min(exit, b);
    if (enter > exit) return null;
  }
  return enter;
}

// Exact BSP segment traversal uses the unexpanded point hull. The standing
// movement hull is deliberately not used for bullets near ceilings and doors.
export function worldHit(data, origin, direction, maximum = 90) {
  const source = [origin[0] * 32, -origin[2] * 32, origin[1] * 32];
  const vector = [direction[0] * 32, -direction[2] * 32, direction[1] * 32];
  const stack = [[data.pointHeadnode, 0, maximum]];
  let nearest = maximum;
  for (let iterations = 0; stack.length && iterations < 100000; iterations++) {
    const [index, start, end] = stack.pop(); if (start >= nearest) continue;
    if (index < 0) { if (data.leafContents[-index - 1] === -2) nearest = Math.min(nearest, start); continue; }
    const [plane, front, back] = data.pointNodes[index], [x, y, z, distance] = data.planes[plane];
    const base = source[0] * x + source[1] * y + source[2] * z - distance;
    const rate = vector[0] * x + vector[1] * y + vector[2] * z;
    const a = base + rate * start, b = base + rate * end;
    if (a >= 0 && b >= 0) { stack.push([front, start, end]); continue; }
    if (a < 0 && b < 0) { stack.push([back, start, end]); continue; }
    const middle = Math.max(start, Math.min(end, start + (end - start) * a / (a - b)));
    const near = a >= 0 ? front : back, far = a >= 0 ? back : front;
    stack.push([far, middle, end], [near, start, middle]);
  }
  for (const [low, high] of data.brushes) {
    const hit = rayBox(origin, direction, low, high, nearest); if (hit !== null) nearest = Math.min(nearest, hit);
  }
  return nearest;
}

export const shotDirection = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
