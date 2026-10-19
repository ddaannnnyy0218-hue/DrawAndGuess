// The recognizer accepts pixels only. It never receives the target word or level.
export function sketchPixels(rgba,width,height){
 let minX=width,minY=height,maxX=-1,maxY=-1,total=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;
  if(Math.min(rgba[i],rgba[i+1],rgba[i+2])<225){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);total++;}
 }
 if(total<12||maxX<minX)return null;
 const side=Math.max(16,Math.max(maxX-minX+1,maxY-minY+1)*1.15);
 const left=(minX+maxX)/2-side/2,top=(minY+maxY)/2-side/2,step=side/28;
 const input=new Float32Array(28*28);
 for(let gy=0;gy<28;gy++)for(let gx=0;gx<28;gx++){
  const x0=Math.floor(left+gx*step),x1=Math.ceil(left+(gx+1)*step),y0=Math.floor(top+gy*step),y1=Math.ceil(top+(gy+1)*step);
  let sum=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   if(x<0||y<0||x>=width||y>=height)continue;
   const i=(y*width+x)*4;if(Math.min(rgba[i],rgba[i+1],rgba[i+2])<225)sum++;
  }
  input[gy*28+gx]=sum/Math.max(1,(x1-x0)*(y1-y0));
 }
 return input;
}
