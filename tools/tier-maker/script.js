let dragged=null;
let touchGhost=null;

const upload=document.getElementById("imageUpload");
const pool=document.getElementById("poolContent");
const board=document.getElementById("tierBoard");

function setupTierItem(img){
  img.className="tier-item";
  img.draggable=true;
  img.addEventListener("dragstart",()=>dragged=img);

  img.addEventListener("touchstart",e=>{
    dragged=img;
    img.classList.add("is-dragging");
    touchGhost=img.cloneNode(true);
    touchGhost.className="tier-item touch-ghost";
    document.body.appendChild(touchGhost);
    moveGhost(e.touches[0]);
  },{passive:false});

  img.addEventListener("touchmove",e=>{
    if(!dragged)return;
    e.preventDefault();
    moveGhost(e.touches[0]);
  },{passive:false});

  img.addEventListener("touchend",e=>{
    if(!dragged)return;
    const t=e.changedTouches[0];
    const target=document.elementFromPoint(t.clientX,t.clientY);
    const zone=target?.closest(".tier-content,.pool-content");
    if(zone)zone.appendChild(dragged);
    cleanupTouchDrag();
  });
}

function moveGhost(touch){
  if(!touchGhost)return;
  touchGhost.style.position='fixed';
  touchGhost.style.pointerEvents='none';
  touchGhost.style.transform='translate(-50%,-50%)';
  touchGhost.style.left=touch.clientX+"px";
  touchGhost.style.top=touch.clientY+"px";
}

function cleanupTouchDrag(){
  if(dragged)dragged.classList.remove("is-dragging");
  dragged=null;
  if(touchGhost){
    touchGhost.remove();
    touchGhost=null;
  }
}

upload.addEventListener("change",e=>{
  for(let file of e.target.files){
    const r=new FileReader();
    r.onload=ev=>{
      const img=document.createElement("img");
      img.src=ev.target.result;
      setupTierItem(img);
      pool.appendChild(img);
    };
    r.readAsDataURL(file);
  }
});

document.addEventListener("dragover",e=>e.preventDefault());

document.addEventListener("drop",e=>{
  const zone=e.target.closest(".tier-content,.pool-content");
  if(zone && dragged){
    zone.appendChild(dragged);
    dragged=null;
  }
});

const slider=document.getElementById("sizeSlider");
slider.addEventListener("input",e=>{
  document.querySelectorAll(".tier-item").forEach(img=>{
    img.style.height=e.target.value+"px";
  });
});

document.addEventListener("input",e=>{
  if(e.target.classList.contains("tier-color")){
    const wrap=e.target.closest(".tier-label-wrap");
    wrap.style.background=e.target.value;
  }
});

const addBtn=document.getElementById("addTierBtn");
addBtn.addEventListener("click",()=>{
  const row=document.createElement("div");
  row.className="tier-row";
  row.innerHTML=`
    <div class="tier-label-wrap" style="background:#ccc">
      <input class="tier-label" value="NEW">
      <input class="tier-color" type="color" value="#ccc">
    </div>
    <div class="tier-content"></div>
    <button class="delete-tier">×</button>
  `;
  document.getElementById("tierBoard").appendChild(row);
});

document.addEventListener("click",e=>{
  if(e.target.classList.contains("delete-tier")){
    e.target.closest(".tier-row").remove();
  }
});

// 下載 PNG（不包含 X）

document.getElementById("saveBtn").addEventListener("click",()=>{
  board.classList.add("exporting");
  import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm').then(({default:html2canvas})=>{
    html2canvas(board,{backgroundColor:'#000'}).then(canvas=>{
      board.classList.remove("exporting");
      const link=document.createElement('a');
      link.download='tier-list.png';
      link.href=canvas.toDataURL();
      link.click();
    });
  });
});
