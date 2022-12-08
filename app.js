
/* global nw */

const trace = console.log;

let win = nw.Window.get();
let tray;
	
let settings = {
	listeners: [],
	volume: 0.5,
	muted: false,
	minimized: false,
	popups: true,
	repeat: true,
	sound_source: 'notificator_alertB.wav'
};

let notifications = [];
//let fetch_promises = [];
let abort_controller = new AbortController();
let global_interval = null;

//let sound_error = new Audio( 'audio/cube_offline.wav' );
let sound_alert = new Audio();// 'audio/notificator_alert.wav' );
function PlaySound( s )
{
	s.pause();
	s.currentTime = 0;
	
	if ( settings.muted )
	return;

	s.volume = settings.volume;
	s.play();
}

let container_listeners = document.querySelector( '#container_listeners' );
let volume_el = document.querySelector( '#volume' );
let muted_el = document.querySelector( '#muted' );
let repeat_el = document.querySelector( '#repeat' );
let popups_el = document.querySelector( '#popups' );
let sound_source_el = document.querySelector( '#sound_source' );

let sample_item = document.querySelector( '#sample_item' );
let item_add_button = document.querySelector( '#item_add_button' );
let item_mark_seen_button = document.querySelector( '#item_mark_seen_button' );

//let listener_to_element = new Map();
let listener_to_extra = new Map();

function Load()
{
	try
	{
		let str = localStorage.settings;
		
		if ( str === undefined )
		{
			
		}
		else
		{
			let obj = JSON.parse( str );
			
			Object.assign( settings, obj ); // Append properties
		}
	}
	catch( e )
	{
		alert( 'Error loading settings...' );
	}
	
	for ( let i = 0; i < settings.listeners.length; i++ )
	SpawnExtraIfMissing( settings.listeners[ i ] );

	volume_el.value = settings.volume;
	muted_el.checked = settings.muted;
	repeat_el.checked = settings.repeat;
	popups_el.checked = settings.popups;
	sound_source_el.value = settings.sound_source;
	sound_alert.src = 'audio/' + settings.sound_source;
	
	UpdateListenersHTML();
}
function Save()
{
	UpdateTrayMenu();
	
	try
	{
		localStorage.settings = JSON.stringify( settings );
	}
	catch( e )
	{
		alert( 'Error saving settings...' );
	}
}
function VolumeChanged()
{
	settings.volume = parseFloat( volume_el.value );
	PlaySound( sound_alert );
	Save();
}
function MutedChanged()
{
	settings.muted = muted_el.checked;
	
	if ( !settings.minimized || !settings.muted )
	PlaySound( sound_alert );

	Save();
}
function RepeatChanged()
{
	settings.repeat = repeat_el.checked;
	Save();
}
function PopupsChanged()
{
	settings.popups = popups_el.checked;
	
	if ( !settings.minimized || !settings.popups )
	Note( 'It will look', 'something like this!' );

	Save();
}
function SoundSourceChanged()
{
	settings.sound_source = sound_source_el.value;
	sound_alert.src = 'audio/' + settings.sound_source;
	
	PlaySound( sound_alert );
	Save();
}
function MinimizeChanged( v )
{
	settings.minimized = v;
	Save();
}
function SpawnExtraIfMissing( listener )
{
	// Not saved properties
	
	if ( listener_to_extra.has( listener ) )
	return;
	
	let element = sample_item.cloneNode( true );
	element.listener = listener;
		
	let extra = {
		element: element,
		pending_request: false,
		last_alert_time: 0,
		last_result: 'Pending...',
		is_in_error: false,
		alerted: false,
		alarm_messages: null, // 2 is icon
		update_delay: 3000,
		last_sync: 0,
		alarm_on_connection_errors: false
	};

	listener_to_extra.set( listener, extra );
	
	element.onmousedown = ()=>
	{
		let suggested_drop_element = null;
		let before_or_after = true; // true for before
		
		document.body.classList.add( 'nohovering' );
		
		window.onmousemove = ( e )=>
		{
			if ( suggested_drop_element )
			{
				suggested_drop_element.style.borderTop = '';
				suggested_drop_element.style.borderBottom = '';
			}
		
			let target = null;
		
			if ( e.target && 
				 e.target.parentNode &&
				 e.target.parentNode.listener )
			{
				target = e.target.parentNode;
				
				if ( target.listener !== listener )
				{
					suggested_drop_element = target;
					
					let bounds = target.getBoundingClientRect();
					
					before_or_after = ( e.pageY < bounds.y + bounds.height / 2 );

					if ( before_or_after )
					suggested_drop_element.style.borderTop = '1px solid #ffff00';
					else
					suggested_drop_element.style.borderBottom = '1px solid #ffff00';
				}
			}
		};
		window.onmouseup = ()=>
		{
			document.body.classList.remove( 'nohovering' );
			
			if ( suggested_drop_element )
			{
				suggested_drop_element.style.borderTop = '';
				suggested_drop_element.style.borderBottom = '';
				
				let relative_to_listener = suggested_drop_element.listener;
				
				let i = settings.listeners.indexOf( listener );
				if ( i !== -1 )
				{
					settings.listeners.splice( i, 1 );
					
					let i2 = settings.listeners.indexOf( relative_to_listener );
					if ( i2 !== -1 )
					{
						if ( before_or_after )
						settings.listeners.splice( i2, 0, listener );
						else
						settings.listeners.splice( i2 + 1, 0, listener );
					
						UpdateListenersHTML();
						Save();
					}
				}
			}
		
			window.onmousemove = null;
			window.onmouseup = null;
		};
	};
}
function MarkAllSeen()
{
	for ( let i = 0; i < settings.listeners.length; i++ )
	{
		let listener = settings.listeners[ i ];
		let extra = listener_to_extra.get( listener );
		
		if ( extra.alerted )
		ListenerClicked( listener );
	}
}
function AddNewListenerByURL()
{
	let r = prompt( 'Enter URL of a listener\n\nYou can get it from context menu of in-game "Security Camera" entity' );
	
	if ( r !== null )
	{
		let listener = {
			url: r,
			custom_caption: '',
			last_trigger_counter: -1
		};
		
		settings.listeners.push( listener );
		
		SpawnExtraIfMissing( listener );
		
		UpdateListenersHTML();
		Save();
	}
}
function UpdateListenerURL( listener )
{
	let r = prompt( 'Enter URL of a listener', listener.url );
	
	if ( r !== null )
	{
		listener.url = r;
		
		let extra = listener_to_extra.get( listener );
		
		extra.last_result = 'Pending...';
		extra.last_alert_time = 0;
		extra.is_in_error = false;
		extra.pending_request = false;
		
		UpdateListenersHTML();
		Save();
	}
}
function GetShortServerURL( listener, strip_protocol=true )
{
	let parts = listener.url.split( '://' );
	
	let protocol = parts[ 0 ] + '://';
	
	parts = parts[ 1 ].split( '/' )[ 0 ];
	
	if ( !strip_protocol )
	{
		parts = protocol + parts;
	}
	else
	{
		parts = parts.split( 'www.' ).join( '' );
	}
	
	return parts;
}
function OpenServerURL( listener )
{
	nw.Shell.openExternal( GetShortServerURL( listener, false ) );
}
function UpdateListenerCaption( listener )
{
	let r = prompt( 'Enter caption', listener.custom_caption || '' );
	
	if ( r !== null )
	{
		listener.custom_caption = r;
		
		let extra = listener_to_extra.get( listener );
		
		extra.last_result = 'Pending...';
		extra.last_alert_time = 0;
		extra.is_in_error = false;
		extra.pending_request = false;
		
		UpdateListenersHTML();
		Save();
	}
}
function DeleteListener( listener )
{
	let i = settings.listeners.indexOf( listener );
	if ( i !== -1 )
	{
		settings.listeners.splice( i, 1 );
		listener_to_extra.delete( listener );
		
		UpdateListenersHTML();
		Save();
	}
}
function ListenerClicked( listener )
{
	let extra = listener_to_extra.get( listener );
		
	extra.alerted = false;
	UpdateListenersHTML();
}

function UpdateListenersHTML()
{
	container_listeners.innerHTML = '';
	
	for ( let i = 0; i < settings.listeners.length; i++ )
	{
		let listener = settings.listeners[ i ];
		let extra = listener_to_extra.get( listener );
		let element = extra.element;
		
		if ( extra.is_in_error )
		element.classList.add( 'item_in_error' );
		else
		element.classList.remove( 'item_in_error' );
		
		if ( extra.alerted && !extra.is_in_error )
		element.classList.add( 'item_alerted' );
		else
		element.classList.remove( 'item_alerted' );
	
		let t = '';//( listener.custom_caption || '' );

		if ( extra.alarm_messages ) 
		{
			if ( t === '' )
			t += extra.alarm_messages[ extra.alerted ? 1 : 0 ];
			else
			t += ' - ' + extra.alarm_messages[ extra.alerted ? 1 : 0 ];
		}

		if ( t === '' )
		t = extra.last_result;
		else
		if ( extra.last_result !== '' )
		t += ' - ' + extra.last_result;

		if ( extra.alarm_messages )
		element.querySelector( '.icon' ).src = 'assets/' + extra.alarm_messages[ 2 ] + '.png';
		
		let title_el = element.querySelector( '.title' );
		title_el.textContent = t;
		
		if ( listener.custom_caption )
		{
			title_el.innerHTML = '<span style="color:#bb9eff"></span> - ' + title_el.innerHTML;
			title_el.childNodes[ 0 ].textContent = listener.custom_caption;
		}
		
		element.querySelector( '.url' ).textContent = GetShortServerURL( listener );
		
		container_listeners.append( element );
	}
	
	container_listeners.append( item_add_button );
	container_listeners.append( item_mark_seen_button );
}

function Note( title, body, icon=null, force=false )
{
	if ( settings.popups || force )
	{
	}
	else
	{
		while ( notifications.length > 0 )
		notifications[ 0 ].close_note();
	
		return;
	}

	let notification = new Notification( title, 
	{
		icon: icon,
		body: body,
		badge: "assets/com16.png"
	});
	
	notifications.push( notification );
	
	notification.onclick = ()=>
	{
		win.restore();
		notification.close_note();
	};
	notification.onshow = ()=>
	{
		// Close the Notification after 1 second
		setTimeout( ()=>
		{ 
			notification.close_note(); 
		}, 5000 );
	};
	notification.close_note = ()=>
	{
		let i = notifications.indexOf( notification );
		if ( i !== -1 )
		{
			notification.close();
			notifications.splice( i, 1 );
		}
	};
	
}
function UpdateTrayMenu()
{
	// Give it a menu
	var menu = new nw.Menu();
	
	if ( settings.minimized )
	menu.append(new nw.MenuItem({ type: 'normal', label: 'Show', click:()=>{
		win.restore();
	} }));
	else
	menu.append(new nw.MenuItem({ type: 'normal', label: 'Hide', click:()=>{
		win.minimize();
	} }));
	
	menu.append(new nw.MenuItem({ type: 'checkbox', label: 'Mute', checked:settings.muted, click:()=>{
		muted_el.click();
	} }));
	menu.append(new nw.MenuItem({ type: 'checkbox', label: 'Repeat', checked:settings.repeat, click:()=>{
		repeat_el.click();
	} }));
	menu.append(new nw.MenuItem({ type: 'checkbox', label: 'Popups', checked:settings.popups, click:()=>{
		popups_el.click();
	} }));
	menu.append(new nw.MenuItem({ type: 'normal', label: 'Quit', click: RealClose }));
	tray.menu = menu;
}
function RealClose()
{
	clearInterval( global_interval );
	global_interval = null;

	while ( notifications.length > 0 )
	notifications[ 0 ].close_note();

	abort_controller.abort();

	nw.App.quit();
}
function Startup()
{
	// Manually move window to middle of screen
	nw.Screen.Init();
	const screen = nw.Screen.screens[0].bounds;
	const x = Math.floor((screen.width - win.width) );
	const y = Math.floor((screen.height - win.height) );
	win.moveTo(x, y);
	
	win.setResizable( false );
	
	win.setAlwaysOnTop( true );
	
	win.on('close', RealClose );
	win.on('minimize', ()=>{
		
		Note( 'Notificator goes to system tray bar', '', null, true );
		
		MinimizeChanged(true);
	} );
	win.on('restore', ()=>MinimizeChanged(false) );
	
	Load();
	
	// Create a tray icon
	tray = new nw.Tray({ title: 'Tray', icon: 'assets/com16.png' });
	UpdateTrayMenu();

	
	if ( nw.App.argv.indexOf( '-minimized' ) !== -1 ||
		 settings.minimized )
	win.minimize();
	
	global_interval = setInterval( ()=>
	{
		//let promises = [];
		
		let now = Date.now();
		
		for ( let i = 0; i < settings.listeners.length; i++ )
		{
			let listener = settings.listeners[ i ];
			let extra = listener_to_extra.get( listener );
			
			if ( extra.pending_request )
			{
			}
			else
			if ( now > extra.last_sync + extra.update_delay )
			{
				extra.pending_request = true;
				extra.last_sync = now;
				
				let url = listener.url;
				
				if ( extra.alarm_messages === null )
				{
					url = url.substring( 0, url.length - 1 ) + ',"first_sync":1}';
				}
				
				function AcceptJSON( json, changed=false )
				{
					let old_counter = listener.last_trigger_counter;

					listener.last_trigger_counter = json.counter;

					let was_alerted = extra.alerted;

					if ( old_counter !== listener.last_trigger_counter && old_counter !== -1 )
					{
						extra.alerted = true;
						was_alerted = false;
					}

					if ( json.alarm_messages )
					extra.alarm_messages = json.alarm_messages;

					if ( json.alarm_on_connection_errors )
					extra.alarm_on_connection_errors = true;

					let old_result_test = extra.last_result;
					extra.last_result = json.message || '';
					//extra.last_result = json.message || ( extra.alarm_messages ? extra.alarm_messages[ extra.alerted ? 1 : 0 ] : '' );


					if ( ( extra.last_alert_time > now - 15000 || !settings.repeat ) && was_alerted )
					{
						// Too quickly
					}
					else
					if ( extra.alerted )
					{
						extra.last_alert_time = now;

						PlaySound( sound_alert );

						if ( !was_alerted )
						{
							let t = ( listener.custom_caption || '' );

							if ( extra.alarm_messages ) 
							{
								if ( t === '' )
								t += extra.alarm_messages[ extra.alerted ? 1 : 0 ];
								else
								t += ' - ' + extra.alarm_messages[ extra.alerted ? 1 : 0 ];
							}

							if ( t === '' )
							t = extra.last_result;
							else
							if ( extra.last_result !== '' )
							t += ' - ' + extra.last_result;

							Note( t, 'Event is happening in game!', extra.alarm_messages ? 'assets/' + extra.alarm_messages[ 2 ] + '.png' : null );
						}
					}

					if ( old_result_test !== extra.last_result )
					changed = true;

					if ( old_counter !== listener.last_trigger_counter )
					{
						changed = true;
						Save();
					}

					if ( changed )
					UpdateListenersHTML();
				}
				
				//let promise = 
				fetch( url ).then(
					( response )=>
					{
						if ( global_interval === null )
						return;
					
						//fetch_promises.splice( fetch_promises.indexOf( promise ), 1 );
						
						response.text().then(
							( str )=>
							{
								extra.pending_request = false;
								
								try
								{
									let json = JSON.parse( str );
									
									let changed = false;

									if ( extra.is_in_error )
									{
										extra.is_in_error = false;
										changed = true;
									}
									
									if ( json instanceof Object )
									{
										if ( json.no_response )
										{
											extra.is_in_error = true;
											extra.update_delay = 15 * 1000;
											
											json = { counter:-22, message: 'Security camera is offline' };
											
											AcceptJSON( json, changed );
										}
										else
										{
											AcceptJSON( json, changed );
										}
									}
									else
									{
										extra.is_in_error = true;
										extra.last_result = 'Bad response Error "'+listener.url+'"...';
										UpdateListenersHTML();
										
										if ( extra.alarm_on_connection_errors )
										AcceptJSON( { counter:-33, message: 'Unable to get response' }, changed );
									}

								}
								catch ( e )
								{
									//PlaySound( sound_error );
						
									extra.is_in_error = true;
									extra.last_result = 'Decode Error "'+listener.url+'"...';
									UpdateListenersHTML();
									
									if ( extra.alarm_on_connection_errors )
									AcceptJSON( { counter:-44, message: 'Unable to get response' } );
								}
							}
						);
					}
				).catch( 
				
					( e )=>
					{
						if ( global_interval === null )
						return;
					
						//fetch_promises.splice( fetch_promises.indexOf( promise ), 1 );
						
						//PlaySound( sound_error );
						
						extra.pending_request = false;
						extra.is_in_error = true;
						//extra.last_result = 'Download Error "'+listener.url+'"...';
						UpdateListenersHTML();
									
						if ( extra.alarm_on_connection_errors )
						AcceptJSON( { counter:-55, message: 'Unable to get response' } );
					}
				
				);
		
				//fetch_promises.push( promise );
			}
		}
		
	}, 1000 );
}
Startup();

document.addEventListener('contextmenu', event => event.preventDefault());