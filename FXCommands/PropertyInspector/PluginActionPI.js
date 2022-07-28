function setdesiredState() {
    var ele = document.getElementById("desiredStates");
    if (ele.value > 5)
        ele.value = 5;
    else if (ele.value <= 0)
        ele.value = 1;

    //This is no longer needed since our configurations will be reloaded, thus causing the update to be called 
    //when the loadConfigurationEvent is executed from loadConfiguration.
    //updateStateVisibilityOnChange()

    setSettings()
}

function updateStateVisibilityOnChange() {
    var ele = document.getElementById("desiredStates");
    updateStateVisibility(ele.value)
}

function updateStateVisibility(desiredStates) {
    for (var i = 0; i < desiredStates; i++) {
        var stateId = "State" + i;
        document.getElementById(stateId).style.display = 'inline'
    }
    for (var i = desiredStates; i < 5; i++) {
        var stateId = "State" + i;
        document.getElementById(stateId).style.display = 'none'
    }
}

function validatePort(eleId) {
    if(eleId.value == null || eleId.value == "")
        eleId.value = eleId.placeholder;
    setSettings();
}

// This is required in order to tell the presentation to update visible states based on configurations when first loading. 
loadConfigurationEvent = updateStateVisibilityOnChange