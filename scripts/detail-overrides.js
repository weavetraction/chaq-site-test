(function () {
    "use strict";

    function setRentDefault() {
        document.querySelectorAll('input[type="radio"][value="lease"][checked]').forEach(function (input) {
            input.removeAttribute("checked");
            input.checked = false;
            var scope = input.closest("ul") || input.parentNode;
            var rent = scope && scope.querySelector('input[type="radio"][value="rent"]');
            if (rent) {
                rent.setAttribute("checked", "checked");
                rent.checked = true;
            }
        });
    }

    function updateSort() {
        var sort = document.getElementById("selSort");
        if (!sort) return;
        sort.innerHTML = '<option value="default">추천순</option>' +
            '<option value="MonthlyPriceAsc">월납입금 낮은순</option>' +
            '<option value="MonthlyPriceDesc">월납입금 높은순</option>' +
            '<option value="carPriceAsc">차량가 낮은순</option>' +
            '<option value="carPriceDesc">차량가 높은순</option>';
    }

    function updateSpecialPriceList() {
        if (!location.pathname.endsWith("special-price-car__list.html")) return;
        document.body.classList.add("special-price-list");
        document.querySelectorAll(".car_info .price").forEach(function (price) {
            if (price.textContent.trim() === "상담문의") price.textContent = "준비중";
        });
        document.querySelectorAll(".btn_inquiry, .moveInquiry").forEach(function (button) {
            button.innerHTML = "셀프 견적 분석";
            button.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopImmediatePropagation();
                location.href = "car-detail.html";
            }, true);
        });
        document.querySelectorAll(".goDetail, .moveDetail, .activeRow").forEach(function (target) {
            target.addEventListener("click", function (event) {
                if (event.target.closest("button") && !event.target.closest(".goDetail, .moveDetail")) return;
                event.preventDefault();
                location.href = "car-detail.html";
            });
        });
    }

    function replaceFooter() {
        var list = document.querySelector("footer .footer_menu ul");
        if (!list) return;
        list.innerHTML = '<li data-url="../index.html"><i class="gnb_icon_pair"><img class="gnb_icon_default" src="../assets/icons/home.svg" alt=""><img class="gnb_icon_color" src="../assets/icons/home-color.svg" alt=""></i><span class="menu_text">홈</span></li>' +
            '<li data-url="special-price-car__list.html"><i class="gnb_icon_pair"><img class="gnb_icon_default" src="../assets/icons/special-gray.svg" alt=""><img class="gnb_icon_color" src="../assets/icons/special-color.svg" alt=""></i><span class="menu_text">재고특가</span></li>' +
            '<li data-url="event__list__ing.html"><span class="float_badge">최대 100만원</span><i class="gnb_icon_pair"><img class="gnb_icon_default" src="../assets/icons/event.svg" alt=""><img class="gnb_icon_color" src="../assets/icons/event-color.svg" alt=""></i><span class="menu_text">이벤트</span></li>' +
            '<li data-url="mypage.html"><i class="gnb_icon_pair"><img class="gnb_icon_default" src="../assets/icons/mypage.svg" alt=""><img class="gnb_icon_color" src="../assets/icons/mypage-color.svg" alt=""></i><span class="menu_text">마이페이지</span></li>' +
            '<li data-url="../index.html#menu"><i class="menu_ico menu_more"></i><span class="menu_text">전체메뉴</span></li>';
        var path = location.pathname;
        if (path.indexOf("event__list") > -1) list.children[2].classList.add("on");
        if (path.indexOf("mypage.html") > -1) list.children[3].classList.add("on");
        list.querySelectorAll("[data-url]").forEach(function (item) {
            item.addEventListener("click", function () { location.href = item.dataset.url; });
        });
    }

    function init() {
        document.body.classList.add("pdf-detail-update");
        setRentDefault();
        updateSort();
        updateSpecialPriceList();
        replaceFooter();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
