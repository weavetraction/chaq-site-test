(function(){
  "use strict";

  var toastTimer;
  function showToast(message){
    var toast=document.querySelector(".toast");
    if(!toast)return;
    toast.textContent=message;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){toast.classList.remove("is-show");},2200);
  }

  document.querySelectorAll("[data-pending-link]:not([data-action=\"inquiry\"])").forEach(function(button){
    button.addEventListener("click",function(){showToast("곧 열릴 예정이에요. 궁금한 점은 상담으로 문의해 주세요.");});
  });

  var promo=document.getElementById("topPromo");
  var promoClose=document.querySelector("[data-close-promo]");
  if(promo&&promoClose){promoClose.addEventListener("click",function(){promo.hidden=true;});}

  var heroSlides=Array.prototype.slice.call(document.querySelectorAll(".hero-slide"));
  var heroCount=document.querySelector(".hero-count");
  var heroIndex=0;
  if(heroSlides.length>1){
    setInterval(function(){
      heroSlides[heroIndex].classList.remove("is-active");
      heroIndex=(heroIndex+1)%heroSlides.length;
      heroSlides[heroIndex].classList.add("is-active");
      if(heroCount)heroCount.textContent=(heroIndex+1)+" / "+heroSlides.length+" ›";
    },3500);
  }

  // 현금지원 이미지 슬라이드 배너 (메인·메뉴 공통, 모든 .cash-slider 인스턴스)
  Array.prototype.forEach.call(document.querySelectorAll(".cash-slider"),function(banner){
    var slides=Array.prototype.slice.call(banner.querySelectorAll(".cs-slide"));
    var dots=Array.prototype.slice.call(banner.querySelectorAll(".cs-dots i"));
    if(slides.length<2)return;
    var i=0;
    setInterval(function(){
      slides[i].classList.remove("is-active");if(dots[i])dots[i].classList.remove("is-on");
      i=(i+1)%slides.length;
      slides[i].classList.add("is-active");if(dots[i])dots[i].classList.add("is-on");
    },3500);
  });

  var logoCards=Array.prototype.slice.call(document.querySelectorAll(".logo-chip-card"));
  var logoIndex=2;
  function renderLogoCards(){
    logoCards.forEach(function(card){card.className="logo-chip-card";});
    if(!logoCards.length)return;
    function at(index){return(index+logoCards.length)%logoCards.length;}
    logoCards[at(logoIndex)].classList.add("is-active");
    logoCards[at(logoIndex-1)].classList.add("is-prev");
    logoCards[at(logoIndex+1)].classList.add("is-next");
  }
  renderLogoCards();
  if(logoCards.length){setInterval(function(){logoIndex=(logoIndex+1)%logoCards.length;renderLogoCards();},1955);}

  var filterButtons=Array.prototype.slice.call(document.querySelectorAll("[data-price-filter]"));
  var stockCards=Array.prototype.slice.call(document.querySelectorAll("#stockList .stock-card"));
  var stockMore=document.getElementById("stockMore");
  var activeGroup=(document.querySelector("[data-price-filter].is-active")||{dataset:{priceFilter:"30"}}).dataset.priceFilter||"30";   // 메인 화면 설정에 따라 시작 탭이 바뀔 수 있음
  var visibleCount=5;

  function renderStocks(){
    var matches=stockCards.filter(function(card){return card.dataset.priceGroup===activeGroup;});
    stockCards.forEach(function(card){card.hidden=true;});
    matches.slice(0,visibleCount).forEach(function(card){card.hidden=false;});
    if(!stockMore)return;
    var totalPages=Math.max(1,Math.ceil(matches.length/5));
    var page=Math.min(totalPages,Math.ceil(Math.min(visibleCount,Math.max(matches.length,1))/5));
    if(matches.length>visibleCount){
      stockMore.innerHTML="특가차량 더보기 <span>"+page+" / "+totalPages+"</span>";
      stockMore.dataset.more="true";
    }else{
      stockMore.textContent="특가차량 전체보기";
      stockMore.dataset.more="false";
    }
  }
  filterButtons.forEach(function(button){
    button.addEventListener("click",function(){
      filterButtons.forEach(function(item){item.classList.remove("is-active");});
      button.classList.add("is-active");
      activeGroup=button.dataset.priceFilter;
      visibleCount=5;
      renderStocks();
    });
  });
  if(stockMore){stockMore.addEventListener("click",function(){
    if(stockMore.dataset.more==="true"){visibleCount=Math.min(15,visibleCount+5);renderStocks();}
    else{location.href="pages/special-price-car__list.html";}
  });}
  renderStocks();

  // 옵션 개수 자동 기입: 각 카드의 data-opt-count(차량 데이터) 값을 칩에 채움
  document.querySelectorAll(".stock-card[data-opt-count]").forEach(function(card){
    var em=card.querySelector(".opt-tag em");
    if(em)em.textContent=card.getAttribute("data-opt-count");
  });

  var menu=document.getElementById("fullMenu");
  function setMenu(open){
    if(!menu)return;
    menu.classList.toggle("is-open",open);
    menu.setAttribute("aria-hidden",String(!open));
    document.body.style.overflow=open?"hidden":"";
    if(open)menu.scrollTop=0;
  }
  document.querySelectorAll("[data-open-menu]").forEach(function(button){button.addEventListener("click",function(){setMenu(true);});});
  document.querySelectorAll("[data-close-menu]").forEach(function(button){button.addEventListener("click",function(){setMenu(false);});});
  document.addEventListener("keydown",function(event){if(event.key==="Escape")setMenu(false);});
  if(location.hash==="#menu")setMenu(true);
})();
