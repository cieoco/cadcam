/** Purchased TT wheel illustration only; never machining geometry or hole records. */
export function wheelAppearance(radius, angle=0) {
  const hubRadius=radius*.72,holeOrbit=radius*.47,holeRadius=radius*.105;
  return {hubRadius,holeRadius,holes:Array.from({length:8},(_,i)=>{
    const a=angle+i*Math.PI/4;return {x:holeOrbit*Math.cos(a),y:holeOrbit*Math.sin(a),r:holeRadius};
  })};
}
