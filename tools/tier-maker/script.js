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
  if(e.target.classList.contains("tier-content") && dragged){
    e.target.appendChild(dragged);
  }
});

const slider=document.getElementById("sizeSlider");
slider.addEventListener("input",e=>{
  document.querySelectorAll(".tier-item").forEach(img=>{
    img.style.height=e.target.value+"px";
  });
});

const addBtn=document.getElementById("addTierBtn");
addBtn.addEventListener("click",()=>{
  const row=document.createElement("div");
  row.className="tier-row";
  row.innerHTML=`
    <input class="tier-label" value="NEW">
    <input class="tier-color" type="color" value="#ccc">
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
