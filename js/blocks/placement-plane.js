// Local 2D x/y and thickness z mapped to a right-handed world plane.
export const PLACEMENT_PLANES=['xy','xz','yz'];
export function placementFrame(plane){
 const axes={xy:[[1,0,0],[0,1,0],[0,0,1]],xz:[[1,0,0],[0,0,1],[0,-1,0]],yz:[[0,1,0],[0,0,1],[1,0,0]]}[plane];
 if(!axes)return null;
 const v=a=>({x:a[0],y:a[1],z:a[2]});
 return {origin:{x:0,y:0,z:0},d:v(axes[0]),n:v(axes[1]),m:v(axes[2]),base:{x:0,y:0},e:{x:1,y:0},f:{x:0,y:1}};
}
