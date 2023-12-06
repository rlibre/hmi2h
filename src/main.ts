import * as fs from "node:fs"
import * as path from "node:path"

import { ObjTypes } from './types.js';
import { program } from "commander";


const ascii_decoder = new TextDecoder( "ascii" );
const utf8_decoder = new TextDecoder( "utf-8" );



class Reader {
	
	private buffer: Buffer;
	private offset: number;
	
	constructor( buffer: Buffer ) {
		this.buffer = buffer;
		this.offset = 0;
	}

	seek( offset: number, from = 0 ) {
		if( from==0 ) {
			this.offset = offset;
		}
		else {
			this.offset += offset;
		}
	}

	readBool( ): boolean {
		const rc = !!this.buffer.readInt8( this.offset );
		this.offset += 1;
		return rc;
	}

	readI8( ): number {
		const rc = this.buffer.readInt8( this.offset );
		this.offset += 1;
		return rc;
	}

	readI16( ): number {
		const rc = this.buffer.readInt16LE( this.offset );
		this.offset += 2;
		return rc;
	}

	readI32( ): number {
		const rc = this.buffer.readInt32LE( this.offset );
		this.offset += 4;
		return rc;
	}

	readStr( length: number, utf8 = false ): string {
		const data = Buffer.copyBytesFrom( this.buffer, this.offset, length );
		const str = utf8 ? utf8_decoder.decode( data ) : ascii_decoder.decode( data );
		this.offset += length

		return str.replace( /\0*$/g,'' )
	}

	readBuf( length: number ): Uint8Array {
		const data = Buffer.copyBytesFrom( this.buffer, this.offset, length );
		this.offset += length
		return data;
	}
}


function isPage( name: string ) {
	return name.endsWith(".pa")
}

function isImage( name: string ) {
	return name.endsWith(".i")
}

function isImageSource( name: string ) {
	return name.endsWith(".is")
}
	




/**
 * hmi is a folder / file architecture
 * 
 * a first document catalog in of the form HMICatalog[] describing entries position/type and size of each items
 * itemds can ben Pages, Images...
 * for each page, a HMIPageCatalog[] describing elements inside it
 */

class HMICatalog {
    name: 	 string;
	offset:  number;
	size: 	 number;
	deleted: boolean;

	read( reader: Reader ) {
		this.name = reader.readStr( 16 );
		this.offset   = reader.readI32( )
        this.size    = reader.readI32( )
        this.deleted = reader.readBool( )
		reader.readI8();
		reader.readI8();
		reader.readI8();
	}
}

/**
 * 
 */

class HMIPageCatalog  {
    
	offset: number;
	size: number;

	read( reader: Reader, base: number ) {
		this.offset = base + reader.readI32( );
		this.size = reader.readI32( );
		reader.readI32( ); // ?
	}
}



/**
 * each page has a header, followed by a catalog of each element
 */

class HMIPageHeader {
    crc: number;
	size: number;
	count: number;
	password: number;	//?
	locked: boolean;
	version: number;
	name: string;
	u1: number;
	u2: number;
	u3: number;
	u4: Uint8Array;

	catalog: HMIPageCatalog[];

	read( reader: Reader, offset: number ) {

		reader.seek( offset );

		this.crc = reader.readI32( );
		this.size = reader.readI32( );
		this.u1 = reader.readI32( );// header size
		this.count = reader.readI32( );
		this.password = reader.readI32( );
		this.locked = reader.readBool( );
		this.u2 = reader.readI8( ); //?
		this.version = reader.readI8( );
		this.u3 = reader.readI8( ); //?
		this.name = reader.readStr( 16 ); //
		this.u4 = reader.readBuf( 16 ); //?
		

		this.catalog = [];
		const self_base = offset+24+16+16;

		for( let i=0; i<this.count; i++ ) {
			const com = new HMIPageCatalog( );
			com.read( reader, self_base )
			this.catalog.push( com );
		}
	}
}

/**
 * each element in a page is describe by that
 * a kind of tree saved in a linear format
 */

class HMIComponent {
	read( reader: Reader, cat: HMIPageCatalog ) {
		reader.seek( cat.offset );

		const vals: Record<string,any> = {};
		
		while( 1 ) {
	
			// list is closed by a 0 sized element
			const size = reader.readI32( );
			if( !size ) {
				break;
			}

			// read a root item
			const ns = reader.readStr( size );
		
			// name-count -> the elment name with sub element count saved in a string.
			const [name,sc] = ns.split( '-' );
			const count = parseInt(sc);
			
			// followed by sub items
			const data: Record<string,Uint8Array> = {}
			const code: string[] = [];

			const is_code = name.startsWith("codes");
			const is_att = name=="att";
			
			for( let i=0; i<count; i++ ) {
				const size = reader.readI32( );
				
				// in case of code, lines are stored directly
				if( is_code ) {
					code.push( reader.readStr( size ) );
				}
				// else, the property name is stored in a 16 byte string
				// followed by a variable size buffer
				else {
					const pname = reader.readStr( 16 );

					let value: any;
					
					switch( pname ) {
						// all string props
						case 'path':
						case 'objname': 
						case 'dir':		
						case 'filter':
							value = reader.readStr( size-16 );
							break;

						case 'txt': 	
							value = reader.readStr( size-16, true );
							break;
						
						
						// all number props (i enum them to find unknown ones)
// clang-format off
						case 'type':	case 'id':			case 'vscope':	
						case 'sta':		case 'psta':		case 'style':	
						case 'key':		case 'font':		case 'pw':		
						case 'val':		case 'txt_maxl':	case 'isbr': 	
						case 'vvs0': 	case 'vvs1': 		case 'vvs2': 	
						case 'vvs3': 	case 'lenth': 		case 'format': 	
						case 'tim': 	case 'en': 			case 'dis': 	
						case 'spax': 	case 'spay': 		case 'xcen': 	
						case 'ycen': 	case 'x': 			case 'y': 		
						case 'w': 		case 'h': 			case 'bco':		
						case 'bco1':	case 'bco2': 		case 'pco': 	
						case 'pco0': 	case 'pco1': 		case 'pco2': 	
						case 'pco3': 	case 'pic': 		case 'pic1': 	
						case 'pic2': 	case 'picc': 		case 'picc1': 	
						case 'picc2': 	case 'bpic': 		case 'ppic': 	
						case 'dez':		case 'border': 		case 'borderc': 
						case 'borderw': case 'mode': 		case 'maxval': 	
						case 'minval': 	case 'drag':		case 'dusup': 	
						case 'aph': 	case 'first': 		case 'time': 	
						case 'sendkey': case 'movex': 		case 'movey': 	
						case 'endx': 	case 'endy': 		case 'effect': 	
						case 'lockobj': case 'groupid0':	case 'groupid1':
						case 'ch': 		case 'gdc': 		case 'gdw': 	
						case 'gdh': 	case 'wid': 		case 'hig': 	
						case 'up': 		case 'down': 		case 'left': 	
						case 'right': 	case 'objWid': 		case 'objHid': 	
						case 'inittrue':case 'molloc': 		case 'molloc_s':
						case 'from':	case 'vid':			case 'path_m':	
						case 'loop':	case 'fps':			case 'stim':	
						case 'qty':		case 'init':		case 'format_m':
						case 'dir_m':	case 'order':		case 'autoleft':	
						case 'filter_m':case 'txt_m':		case 'insert':
						case 'delete':	case 'clear':		case 'maxval_y':
						case 'val_y':	case 'maxval_x':	case 'val_x':
						case 'leftshow':case 'drastate': {
// clang-format on
							switch( size-16 ) {
								case 1:	
									value = reader.readI8( );
									break;

								case 2:	
									value = reader.readI16( );
									break;

								case 4:	
									value = reader.readI32( );
									break;

								default:
									debugger;
									break;
							}

							if( value==0 ) {
								//continue;
							}

							break;
						}
						
						default: {
							console.log( "unknown attribute name:", pname )
							debugger;
							break;
						}
					}

					// special post 
					switch( pname ) {
						case 'type':
							value = ObjTypes[value].toLowerCase();
							break;

						case 'endx': 	
						case 'endy': 		
							continue;				
					}
					
					if( is_att ) {
						vals[pname] = value;
					}
					else {
						data[pname] = value;
					}
				}
			}

			if( is_code ) {
				vals[name] = code.join( '\n' );
			}
			else {
				if( name!="att" ) {
					vals[name] = data;
				}
			}
		}

		return vals;
	}
}

/**
 * a Page representation
 */

class HMIPage {
	
	read( reader: Reader, cat: HMICatalog ) {

		const header = new HMIPageHeader( );
		header.read( reader, cat.offset );
		//console.log( cat.name, header );

		const components = header.catalog.map( x => {
			const com = new HMIComponent( );
			return com.read( reader, x );
		} );

		let page: any = {};
		if( components[0].type=='page' ) {
			page = components.shift( );
		}

		page.offset = cat.offset;

		return {
			header: page,
			components
		};
	}
}

class HMIMain {

	read( reader: Reader, cat: HMICatalog ) {

		// 
		reader.seek( cat.offset+0x1c );
		const count = reader.readI32( );
		const memalloc = reader.readI32( );
		reader.seek( 0x3c, 1 );

		const order: Record<string,string>[ ] = [];

		for( let i=0; i<count; i++ ) {
			const type = reader.readStr( 8 );
			const file = reader.readStr( 8 );

			order.push( {type,file} )
		}

		return order;
	}

}

/**
 * 
 */

class HMIFile {
    
	read( reader: Reader ) {
		const count = reader.readI32( );
		const catalog: HMICatalog[] = []

		for( let i=0; i<count; i++ ) {
			const obj = new HMICatalog( );
			obj.read( reader );

			if( !obj.deleted ) {
				catalog.push(obj);
			}
		}

		// search the main representation
		const main = catalog.find( ( x ) => {
			return x.name=="main.HMI";
		})

		const m = new HMIMain( );
		const order = m.read( reader, main ).filter( p => p.type=='pa' );;
		//console.log( order );
		
		// extract pages
		const pges = catalog.filter( x => isPage(x.name) );
		const pages = pges.map( x => {
			const pge = new HMIPage( );
			const res = pge.read( reader, x );

			res.header.id = order.findIndex( p => p.file==x.name );
			return res;
		})

		pages.sort( (a, b) => a.header.id-b.header.id );

		return {
			main,
			pages
		}
	}
}




function gen_c_headers( content, output ) {

	const code: string[] = [];

	content.pages.forEach( (p) => {
		const pname: string = p.header.objname.toUpperCase();
		code.push( `#define\tPAGE_ID_${pname} ${p.header.id}` );

		p.components.forEach( c=> {
			const cname: string = c.objname.toUpperCase();
			code.push( `#define\t\tPAGE_${pname}_${cname} ${c.id}   // ${c.type}` );
			code.push( `#define\t\tPAGE_${pname}_${cname}_NAME "${c.objname}"` );
		})

		code.push("");
	});


	fs.writeFileSync( output, code.join('\n') );
}




function main( input: string, options: any ) {

	const data = fs.readFileSync( input );
	const reader = new Reader( data );

	const hmiHeader = new HMIFile( );
	const content = hmiHeader.read( reader );

	const output = options.output ?? input.replace( /\.hmi$/i, '' )+".h";
	gen_c_headers( content, output );

	// write extraction
	//fs.writeFileSync( "out/pages.json", JSON.stringify(content,undefined,4));
}



program
	.version('1.0')
	.description('Extract c header from nextion hmi file')
	.arguments('<path>')
	.option('-o, --output [output]', 'Output file name', null)
	.action( function(path,options) {
		main( path, options );
	})

program.parse(process.argv);









