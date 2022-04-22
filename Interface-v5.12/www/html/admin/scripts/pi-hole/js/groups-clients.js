/* Pi-hole: A black hole for Internet advertisements
 *  (c) 2017 Pi-hole, LLC (https://pi-hole.net)
 *  Network-wide ad blocking via your own hardware.
 *
 *  This file is copyright under the latest version of the EUPL.
 *  Please see LICENSE file for your rights under this license. */

/* global utils:false */

var table;
var groups = [];
var token = $("#token").text();

function reloadClientSuggestions() {
  $.post(
    "scripts/pi-hole/php/groups.php",
    { action: "get_unconfigured_clients", token: token },
    function (data) {
      var sel = $("#select");
      sel.empty();

      // In order for the placeholder value to appear, we have to have a blank
      // <option> as the first option in our <select> control. This is because
      // the browser tries to select the first option by default. If our first
      // option were non-empty, the browser would display this instead of the
      // placeholder.
      sel.append($("<option />"));

      // Add data obtained from API
      for (var key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) {
          continue;
        }

        var text = key;
        var keyPlain = key;
        if (key.startsWith("IP-")) {
          // Mock MAC address for address-only devices
          keyPlain = key.substring(3);
          text = keyPlain;
        }

        // Append host name if available
        if (data[key].length > 0) {
          text += " (" + data[key] + ")";
        }

        sel.append($("<option />").val(keyPlain).text(text));
      }
    },
    "json"
  );
}

function getGroups() {
  $.post(
    "scripts/pi-hole/php/groups.php",
    { action: "get_groups", token: token },
    function (data) {
      groups = data.data;
      initTable();
    },
    "json"
  );
}

$(function () {
  $("#btnAdd").on("click", addClient);
  $("select").select2({
    tags: true,
    placeholder: "选择客户端...",
    allowClear: true,
  });

  reloadClientSuggestions();
  utils.setBsSelectDefaults();
  getGroups();

  $("#select").on("change", function () {
    $("#ip-custom").val("");
    $("#ip-custom").prop("disabled", $("#select option:selected").val() !== "custom");
  });
});

function initTable() {
  table = $("#clientsTable").DataTable({
    ajax: {
      url: "scripts/pi-hole/php/groups.php",
      data: { action: "get_clients", token: token },
      type: "POST",
    },
    order: [[0, "asc"]],
    columns: [
      { data: "id", visible: false },
      { data: "ip", type: "ip-address" },
      { data: "comment" },
      { data: "groups", searchable: false },
      { data: "name", width: "22px", orderable: false },
    ],
    columnDefs: [
      {
        targets: "_all",
        render: $.fn.dataTable.render.text(),
      },
    ],
    drawCallback: function () {
      $('button[id^="deleteClient_"]').on("click", deleteClient);
      // Remove visible dropdown to prevent orphaning
      $("body > .bootstrap-select.dropdown").remove();
    },
    rowCallback: function (row, data) {
      $(row).attr("data-id", data.id);
      var tooltip =
        "添加时间：" +
        utils.datetime(data.date_added, false) +
        "\n上次修改：" +
        utils.datetime(data.date_modified, false) +
        "\n数据库ID：" +
        data.id;
      var ipName =
        '<code id="ip_' +
        data.id +
        '" title="' +
        tooltip +
        '" class="breakall">' +
        data.ip +
        "</code>";
      if (data.name !== null && data.name.length > 0)
        ipName +=
          '<br><code id="name_' +
          data.id +
          '" title="' +
          tooltip +
          '" class="breakall">' +
          data.name +
          "</code>";
      $("td:eq(0)", row).html(ipName);

      $("td:eq(1)", row).html('<input id="comment_' + data.id + '" class="form-control">');
      var commentEl = $("#comment_" + data.id, row);
      commentEl.val(utils.unescapeHtml(data.comment));
      commentEl.on("change", editClient);

      $("td:eq(2)", row).empty();
      $("td:eq(2)", row).append(
        '<select class="selectpicker" id="multiselect_' + data.id + '" multiple></select>'
      );
      var selectEl = $("#multiselect_" + data.id, row);
      // Add all known groups
      for (var i = 0; i < groups.length; i++) {
        var dataSub = "";
        if (!groups[i].enabled) {
          dataSub = 'data-subtext="(disabled)"';
        }

        selectEl.append(
          $("<option " + dataSub + "/>")
            .val(groups[i].id)
            .text(groups[i].name)
        );
      }

      // Select assigned groups
      selectEl.val(data.groups);
      // Initialize bootstrap-select
      selectEl
        // fix dropdown if it would stick out right of the viewport
        .on("show.bs.select", function () {
          var winWidth = $(window).width();
          var dropdownEl = $("body > .bootstrap-select.dropdown");
          if (dropdownEl.length > 0) {
            dropdownEl.removeClass("align-right");
            var width = dropdownEl.width();
            var left = dropdownEl.offset().left;
            if (left + width > winWidth) {
              dropdownEl.addClass("align-right");
            }
          }
        })
        .on("changed.bs.select", function () {
          // enable Apply button
          if ($(applyBtn).prop("disabled")) {
            $(applyBtn)
              .addClass("btn-success")
              .prop("disabled", false)
              .on("click", function () {
                editClient.call(selectEl);
              });
          }
        })
        .on("hide.bs.select", function () {
          // Restore values if drop-down menu is closed without clicking the Apply button
          if (!$(applyBtn).prop("disabled")) {
            $(this).val(data.groups).selectpicker("refresh");
            $(applyBtn).removeClass("btn-success").prop("disabled", true).off("click");
          }
        })
        .selectpicker()
        .siblings(".dropdown-menu")
        .find(".bs-actionsbox")
        .prepend(
          '<button type="button" id=btn_apply_' +
            data.id +
            ' class="btn btn-block btn-sm" disabled>应用</button>'
        );

      var applyBtn = "#btn_apply_" + data.id;

      var button =
        '<button type="button" class="btn btn-danger btn-xs" id="deleteClient_' +
        data.id +
        '">' +
        '<span class="far fa-trash-alt"></span>' +
        "</button>";
      $("td:eq(3)", row).html(button);
    },
    dom:
      "<'row'<'col-sm-12'f>>" +
      "<'row'<'col-sm-4'l><'col-sm-8'p>>" +
      "<'row'<'col-sm-12'<'table-responsive'tr>>>" +
      "<'row'<'col-sm-5'i><'col-sm-7'p>>",
    lengthMenu: [
      [10, 25, 50, 100, -1],
      [10, 25, 50, 100, "全部"],
    ],
    stateSave: true,
    stateDuration: 0,
    stateSaveCallback: function (settings, data) {
      utils.stateSaveCallback("groups-clients-table", data);
    },
    stateLoadCallback: function () {
      var data = utils.stateLoadCallback("groups-clients-table");

      // Return if not available
      if (data === null) {
        return null;
      }

      // Reset visibility of ID column
      data.columns[0].visible = false;
      // Apply loaded state to table
      return data;
    },
  });

  // Disable autocorrect in the search box
  var input = document.querySelector("input[type=search]");
  if (input !== null) {
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", false);
  }

  table.on("order.dt", function () {
    var order = table.order();
    if (order[0][0] !== 0 || order[0][1] !== "asc") {
      $("#resetButton").removeClass("hidden");
    } else {
      $("#resetButton").addClass("hidden");
    }
  });

  $("#resetButton").on("click", function () {
    table.order([[0, "asc"]]).draw();
    $("#resetButton").addClass("hidden");
  });
}

function addClient() {
  var ip = utils.escapeHtml($("#select").val().trim());
  var comment = utils.escapeHtml($("#new_comment").val());

  utils.disableAll();
  utils.showAlert("info", "", "正在添加客户端...", ip);

  if (ip.length === 0) {
    utils.enableAll();
    utils.showAlert("warning", "", "警告", "请指定客户端 IP 或 MAC 地址");
    return;
  }

  // Validate input, can be:
  // - IPv4 address (with and without CIDR)
  // - IPv6 address (with and without CIDR)
  // - MAC address (in the form AA:BB:CC:DD:EE:FF)
  // - host name (arbitrary form, we're only checking against some reserved characters)
  if (utils.validateIPv4CIDR(ip) || utils.validateIPv6CIDR(ip) || utils.validateMAC(ip)) {
    // Convert input to upper case (important for MAC addresses)
    ip = ip.toUpperCase();
  } else if (!utils.validateHostname(ip)) {
    utils.enableAll();
    utils.showAlert(
      "warning",
      "",
      "警告",
      "输入的信息既不是有效的 IP 或 MAC 地址，也不是有效的主机名！"
    );
    return;
  }

  $.ajax({
    url: "scripts/pi-hole/php/groups.php",
    method: "post",
    dataType: "json",
    data: { action: "add_client", ip: ip, comment: comment, token: token },
    success: function (response) {
      utils.enableAll();
      if (response.success) {
        utils.showAlert("success", "fas fa-plus", "已成功添加客户端", ip);
        reloadClientSuggestions();
        table.ajax.reload(null, false);
      } else {
        utils.showAlert("error", "", "添加客户端时出错", response.message);
      }
    },
    error: function (jqXHR, exception) {
      utils.enableAll();
      utils.showAlert("error", "", "添加客户端时出错", jqXHR.responseText);
      console.log(exception); // eslint-disable-line no-console
    },
  });
}

function editClient() {
  var elem = $(this).attr("id");
  var tr = $(this).closest("tr");
  var id = tr.attr("data-id");
  var groups = tr.find("#multiselect_" + id).val();
  var ip = utils.escapeHtml(tr.find("#ip_" + id).text());
  var name = utils.escapeHtml(tr.find("#name_" + id).text());
  var comment = utils.escapeHtml(tr.find("#comment_" + id).val());

  var done = "修改";
  var notDone = "正在修改";
  switch (elem) {
    case "multiselect_" + id:
      done = "修改群组，";
      notDone = "正在修改群组";
      break;
    case "comment_" + id:
      done = "修改描述，";
      notDone = "正在修改描述";
      break;
    default:
      alert("元素错误或数据id无效！");
      return;
  }

  if (name.length > 0) {
    ip += " (" + name + ")";
  }

  utils.disableAll();
  utils.showAlert("info", "", "正在修改客户端...", ip);
  $.ajax({
    url: "scripts/pi-hole/php/groups.php",
    method: "post",
    dataType: "json",
    data: {
      action: "edit_client",
      id: id,
      groups: groups,
      token: token,
      comment: comment,
    },
    success: function (response) {
      utils.enableAll();
      if (response.success) {
        utils.showAlert("success", "fas fa-pencil-alt", "已成功" + done + " 客户端：", ip);
        table.ajax.reload(null, false);
      } else {
        utils.showAlert(
          "error",
           "ID为" + id + "的客户端，" + notDone + "的过程中出错",
          response.message
        );
      }
    },
    error: function (jqXHR, exception) {
      utils.enableAll();
      utils.showAlert(
        "error",
        "",
        "ID为" + id + "的客户端，" + notDone + "的过程中出错",
        jqXHR.responseText
      );
      console.log(exception); // eslint-disable-line no-console
    },
  });
}

function deleteClient() {
  var tr = $(this).closest("tr");
  var id = tr.attr("data-id");
  var ip = utils.escapeHtml(tr.find("#ip_" + id).text());
  var name = utils.escapeHtml(tr.find("#name_" + id).text());

  if (name.length > 0) {
    ip += " (" + name + ")";
  }

  utils.disableAll();
  utils.showAlert("info", "", "正在删除客户端...", ip);
  $.ajax({
    url: "scripts/pi-hole/php/groups.php",
    method: "post",
    dataType: "json",
    data: { action: "delete_client", id: id, token: token },
    success: function (response) {
      utils.enableAll();
      if (response.success) {
        utils.showAlert("success", "far fa-trash-alt", "已删除客户端", ip);
        table.row(tr).remove().draw(false).ajax.reload(null, false);
        reloadClientSuggestions();
      } else {
        utils.showAlert("error", "", "删除ID为" + id + "的客户端时出错", response.message);
      }
    },
    error: function (jqXHR, exception) {
      utils.enableAll();
      utils.showAlert("error", "", "删除ID为" + id + "的客户端时出错", jqXHR.responseText);
      console.log(exception); // eslint-disable-line no-console
    },
  });
}
