let dragged=null;

const upload=document.getElementById("imageUpload");
const pool=document.getElementById("poolContent");

upload.addEventListener("change",e=>{
  for(let file of e.target.files){
    const r=new FileReader();
    r.onload=ev=>{
      const img=document.createElement("img");
      img.src=ev.target.result;
      img.className="tier-item";
      img.draggable=true;
      img.addEventListener("dragstart",()=>dragged=img);
      pool.appendChild(img);
    };
    r.readAsDataURL(file);
  }
});

document.addEventListener("dragover",e=>e.preventDefault());

document.addEventListener("drop",e=>{
  const zone=e.target.closest(".tier-content");
  if(zone && dragged){
    zone.appendChild(dragged);
  }
});

const slider=document.getElementById("sizeSlider");
slider.addEventListener("input",e=>{
  document.querySelectorAll(".tier-item").forEach(img=>{
    img.style.height=e.target.value+"px";
  });
});

// 顏色 → 整塊 label

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
